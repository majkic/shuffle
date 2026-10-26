import 'dotenv/config';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import express, { Request, Response } from 'express';
import { Pool, type PoolClient } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import type { ListItem, ShuffleList } from './src/types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(
  process.env.AUTH_PORT || process.env.PORT || (process.env.NODE_ENV === 'production' ? 3005 : 3010),
);
const appUrl = process.env.APP_URL || 'http://localhost:3005';
const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3010/api/auth/google/callback';
const sessionCookieName = 'shuffle_session';
const stateCookieName = 'shuffle_oauth_state';
const sessionMaxAgeSeconds = 60 * 60 * 8;

app.use(express.json({ limit: '10mb' }));

const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'majkic@gmail.com';
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

interface DatabaseUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'superadmin' | 'admin' | 'viewer' | 'pending';
  disabled: boolean;
  createdAt: string;
}

interface DatabaseCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
}

interface SessionPayload {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  exp: number;
}

const cookieOptions = (maxAge: number) => [
  'HttpOnly',
  'SameSite=Lax',
  'Path=/',
  `Max-Age=${maxAge}`,
  ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
].join('; ');

const signSession = (payload: SessionPayload) => {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', process.env.SESSION_SECRET!)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
};

const readSession = (req: Request): SessionPayload | null => {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader || !process.env.SESSION_SECRET) return null;

  const token = cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${sessionCookieName}=`))
    ?.slice(sessionCookieName.length + 1);
  if (!token) return null;

  const [encoded, signature, ...extra] = token.split('.');
  if (!encoded || !signature || extra.length > 0) return null;

  const expected = createHmac('sha256', process.env.SESSION_SECRET)
    .update(encoded)
    .digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as SessionPayload;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
};

const oauthConfiguration = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  sessionSecret: process.env.SESSION_SECRET,
});

const requireOAuthConfiguration = (res: Response) => {
  const config = oauthConfiguration();
  if (!config.clientId || !config.clientSecret || !config.sessionSecret) {
    res.status(503).send('Google sign-in is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and SESSION_SECRET.');
    return null;
  }
  return config;
};

const requireDatabase = (res: Response) => {
  if (!pool) {
    res.status(503).send('Database is not configured. Set DATABASE_URL before using Google sign-in.');
    return false;
  }
  return true;
};

const getSessionUser = async (req: Request): Promise<DatabaseUser | null> => {
  const session = readSession(req);
  if (!session || !pool) return null;
  const result = await pool.query<{
    id: string;
    email: string;
    name: string;
    avatar: string | null;
    role: DatabaseUser['role'];
    disabled: boolean;
    created_at: Date;
  }>(
    'SELECT id, email, name, avatar, role, disabled, created_at FROM users WHERE email = $1',
    [session.email],
  );
  const user = result.rows[0];
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar || undefined,
    role: user.role,
    disabled: user.disabled,
    createdAt: user.created_at.toISOString(),
  };
};

const isSuperadmin = (user: DatabaseUser) =>
  user.role === 'superadmin' || user.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();

const getListAccess = async (user: DatabaseUser, listId: string) => {
  if (isSuperadmin(user)) return true;
  const result = await pool!.query(
    'SELECT 1 FROM user_list_access WHERE user_id = $1 AND list_id = $2',
    [user.id, listId],
  );
  return (result.rowCount ?? 0) > 0;
};

const listSelect = `
  SELECT
    l.id, l.name, l.category, l.description, l.creator_id, l.creator_email,
    l.creator_name, l.creator_avatar, l.is_public, l.shuffle_count, l.created_at, l.updated_at,
    li.id AS item_id, li.text AS item_text, li.selected AS item_selected,
    li.prioritized AS item_prioritized, li.created_at AS item_created_at
  FROM lists l
  LEFT JOIN list_items li ON li.list_id = l.id
`;

const getListsForUser = async (user: DatabaseUser): Promise<ShuffleList[]> => {
  const values: string[] = [];
  let accessFilter = '';
  if (!isSuperadmin(user)) {
    values.push(user.id);
    accessFilter = `
      WHERE EXISTS (
        SELECT 1 FROM user_list_access ula
        WHERE ula.user_id = $1 AND ula.list_id = l.id
      )
    `;
  }
  const result = await pool!.query<{
    id: string;
    name: string;
    category: string;
    description: string | null;
    creator_id: string | null;
    creator_email: string;
    creator_name: string;
    creator_avatar: string | null;
    is_public: boolean;
    shuffle_count: number;
    created_at: Date;
    updated_at: Date;
    item_id: string | null;
    item_text: string | null;
    item_selected: boolean | null;
    item_prioritized: boolean | null;
    item_created_at: Date | null;
  }>(`${listSelect} ${accessFilter} ORDER BY l.created_at DESC, li.sort_order ASC`, values);

  const lists = new Map<string, ShuffleList>();
  for (const row of result.rows) {
    let list = lists.get(row.id);
    if (!list) {
      list = {
        id: row.id,
        name: row.name,
        category: row.category,
        description: row.description || undefined,
        items: [],
        creatorId: row.creator_id || '',
        creatorEmail: row.creator_email,
        creatorName: row.creator_name,
        creatorAvatar: row.creator_avatar || undefined,
        isPublic: row.is_public,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        shuffleCount: row.shuffle_count,
      };
      lists.set(row.id, list);
    }
    if (row.item_id && row.item_text !== null) {
      const item: ListItem = {
        id: row.item_id,
        text: row.item_text,
        selected: row.item_selected ?? true,
        prioritized: row.item_prioritized ?? false,
        createdAt: row.item_created_at?.getTime() ?? Date.now(),
      };
      list.items.push(item);
    }
  }
  return [...lists.values()];
};

const validateListItems = (items: unknown): ListItem[] | null => {
  if (!Array.isArray(items)) return null;
  const seen = new Set<string>();
  const seenIds = new Set<string>();
  const sanitized: ListItem[] = [];
  for (const [index, item] of items.entries()) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.text !== 'string' ||
      typeof item.id !== 'string' ||
      typeof item.selected !== 'boolean' ||
      typeof item.prioritized !== 'boolean'
    ) {
      return null;
    }
    const text = item.text.trim();
    const normalized = text.toLowerCase();
    if (!text || seen.has(normalized)) return null;
    const id = item.id.trim() || randomUUID();
    if (id.length > 64 || seenIds.has(id)) return null;
    seen.add(normalized);
    seenIds.add(id);
    sanitized.push({
      id,
      text,
      selected: item.selected,
      prioritized: item.prioritized,
      createdAt:
        typeof item.createdAt === 'number' &&
        Number.isFinite(item.createdAt) &&
        Number.isFinite(new Date(item.createdAt).getTime())
          ? item.createdAt
          : index,
    });
  }
  return sanitized;
};

app.get('/api/auth/google', (_req: Request, res: Response) => {
  if (!requireDatabase(res)) return;
  const config = requireOAuthConfiguration(res);
  if (!config) return;

  const state = randomBytes(32).toString('base64url');
  res.setHeader('Set-Cookie', `${stateCookieName}=${state}; ${cookieOptions(600)}`);

  const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
  }).toString();
  res.redirect(authorizationUrl.toString());
});

app.get('/api/auth/google/callback', async (req: Request, res: Response) => {
  if (!requireDatabase(res)) return;
  const config = requireOAuthConfiguration(res);
  if (!config) return;

  const cookies = req.headers.cookie?.split(';').map((cookie) => cookie.trim()) ?? [];
  const savedState = cookies
    .find((cookie) => cookie.startsWith(`${stateCookieName}=`))
    ?.slice(stateCookieName.length + 1);
  const returnedState = typeof req.query.state === 'string' ? req.query.state : '';

  res.setHeader('Set-Cookie', `${stateCookieName}=; ${cookieOptions(0)}`);
  if (!savedState || !returnedState || savedState !== returnedState) {
    res.status(400).send('Google sign-in could not be verified. Please try again.');
    return;
  }
  if (typeof req.query.error === 'string') {
    res.status(400).send('Google sign-in was cancelled or denied.');
    return;
  }
  if (typeof req.query.code !== 'string') {
    res.status(400).send('Google did not return an authorization code.');
    return;
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: config.clientId!,
        client_secret: config.clientSecret!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResponse.ok) {
      res.status(502).send('Google could not complete sign-in. Check the OAuth client and redirect URI configuration.');
      return;
    }

    const tokenData = await tokenResponse.json() as { access_token?: string };
    if (!tokenData.access_token) {
      res.status(502).send('Google did not return an access token.');
      return;
    }

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!profileResponse.ok) {
      res.status(502).send('Google could not verify the signed-in account.');
      return;
    }

    const profile = await profileResponse.json() as GoogleProfile;
    if (!profile.sub || !profile.email || !profile.email_verified) {
      res.status(403).send('Google sign-in requires a verified email address.');
      return;
    }

    const email = profile.email.toLowerCase();
    const role = email === SUPERADMIN_EMAIL.toLowerCase() ? 'superadmin' : 'pending';
    const savedUser = await pool!.query<{ id: string }>(
      `INSERT INTO users (id, email, name, avatar, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         avatar = EXCLUDED.avatar,
         role = CASE WHEN EXCLUDED.role = 'superadmin' THEN 'superadmin' ELSE users.role END
       RETURNING id`,
      [profile.sub, email, profile.name || email, profile.picture || null, role],
    );
    const payload: SessionPayload = {
      sub: savedUser.rows[0].id,
      email,
      name: profile.name || email,
      picture: profile.picture,
      exp: Math.floor(Date.now() / 1000) + sessionMaxAgeSeconds,
    };
    res.setHeader('Set-Cookie', [
      `${stateCookieName}=; ${cookieOptions(0)}`,
      `${sessionCookieName}=${signSession(payload)}; ${cookieOptions(sessionMaxAgeSeconds)}`,
    ]);
    res.redirect(appUrl);
  } catch (error) {
    console.error('Google OAuth callback failed:', error);
    res.status(502).send('Google sign-in failed while contacting Google. Please try again.');
  }
});

app.get('/api/auth/session', async (req: Request, res: Response) => {
  const session = readSession(req);
  if (!session) {
    res.json({ user: null });
    return;
  }

  if (!requireDatabase(res)) return;
  try {
    const user = await getSessionUser(req);
    if (!user) {
      res.status(401).json({ user: null });
      return;
    }
    res.json({ user });
  } catch (error) {
    console.error('Unable to load authenticated user:', error);
    res.status(500).send('Unable to load the signed-in user.');
  }
});

app.get('/api/admin/users', async (req: Request, res: Response) => {
  if (!requireDatabase(res)) return;
  try {
    const caller = await getSessionUser(req);
    if (!caller || caller.disabled) {
      res.status(401).send('An enabled signed-in account is required.');
      return;
    }
    if (!isSuperadmin(caller)) {
      res.status(403).send('Only superadmins can view users.');
      return;
    }

    const result = await pool!.query<{
      id: string;
      email: string;
      name: string;
      avatar: string | null;
      role: DatabaseUser['role'];
      disabled: boolean;
      created_at: Date;
    }>('SELECT id, email, name, avatar, role, disabled, created_at FROM users ORDER BY created_at, email');
    res.json(result.rows.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar || undefined,
      role: user.role,
      disabled: user.disabled,
      createdAt: user.created_at.toISOString(),
    })));
  } catch (error) {
    console.error('Unable to load users for superadmin:', error);
    res.status(500).send('Unable to load users.');
  }
});

app.patch('/api/admin/users/:userId/role', async (req: Request, res: Response) => {
  if (!requireDatabase(res)) return;
  try {
    const caller = await getSessionUser(req);
    if (!caller || caller.disabled) {
      res.status(401).send('An enabled signed-in account is required.');
      return;
    }
    if (!isSuperadmin(caller)) {
      res.status(403).send('Only superadmins can change user access.');
      return;
    }

    const { role, disabled } = req.body ?? {};
    if (role === undefined && disabled === undefined) {
      res.status(400).send('A role or disabled status is required.');
      return;
    }
    const allowedRoles = ['pending', 'viewer', 'admin', 'superadmin'] as const;
    if (role !== undefined && (typeof role !== 'string' || !allowedRoles.includes(role as typeof allowedRoles[number]))) {
      res.status(400).send('A valid user role is required.');
      return;
    }
    if (disabled !== undefined && typeof disabled !== 'boolean') {
      res.status(400).send('Disabled status must be true or false.');
      return;
    }
    const targetId = req.params.userId;
    const target = await pool!.query('SELECT email FROM users WHERE id = $1', [targetId]);
    if (target.rowCount === 0) {
      res.status(404).send('User not found.');
      return;
    }
    if (
      String(target.rows[0].email).toLowerCase() === SUPERADMIN_EMAIL.toLowerCase() &&
      ((role !== undefined && role !== 'superadmin') || disabled === true)
    ) {
      res.status(400).send('Cannot change access for the primary superadmin.');
      return;
    }
    if (String(target.rows[0].email).toLowerCase() === caller.email.toLowerCase() && disabled === true) {
      res.status(400).send('You cannot disable your own account.');
      return;
    }

    const updates: string[] = [];
    const values: (string | boolean)[] = [];
    if (role !== undefined) {
      values.push(role);
      updates.push(`role = $${values.length}`);
    }
    if (disabled !== undefined) {
      values.push(disabled);
      updates.push(`disabled = $${values.length}`);
    }
    values.push(targetId);
    const result = await pool!.query<{
      id: string;
      email: string;
      name: string;
      avatar: string | null;
      role: DatabaseUser['role'];
      disabled: boolean;
      created_at: Date;
    }>(
      `UPDATE users SET ${updates.join(', ')}
       WHERE id = $${values.length} RETURNING id, email, name, avatar, role, disabled, created_at`,
      values,
    );
    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar || undefined,
      role: user.role,
      disabled: user.disabled,
      createdAt: user.created_at.toISOString(),
    });
  } catch (error) {
    console.error('Unable to change user access:', error);
    res.status(500).send('Unable to change user access.');
  }
});

app.delete('/api/admin/users/:userId', async (req: Request, res: Response) => {
  if (!requireDatabase(res)) return;
  try {
    const caller = await getSessionUser(req);
    if (!caller || caller.disabled) {
      res.status(401).send('An enabled signed-in account is required.');
      return;
    }
    if (!isSuperadmin(caller)) {
      res.status(403).send('Only superadmins can delete users.');
      return;
    }

    const targetId = req.params.userId;
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
      const target = await client.query<{ email: string }>(
        'SELECT email FROM users WHERE id = $1 FOR UPDATE',
        [targetId],
      );
      if (!target.rows[0]) {
        await client.query('ROLLBACK');
        res.status(404).send('User not found.');
        return;
      }
      if (target.rows[0].email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase()) {
        await client.query('ROLLBACK');
        res.status(400).send('Cannot delete the primary superadmin.');
        return;
      }
      if (target.rows[0].email.toLowerCase() === caller.email.toLowerCase()) {
        await client.query('ROLLBACK');
        res.status(400).send('You cannot delete your own account.');
        return;
      }

      await client.query('UPDATE lists SET creator_id = NULL WHERE creator_id = $1', [targetId]);
      await client.query('DELETE FROM users WHERE id = $1', [targetId]);
      await client.query('COMMIT');
      res.status(204).end();
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Unable to delete user:', error);
    res.status(500).send('Unable to delete user.');
  }
});

app.get('/api/admin/users/:userId/list-access', async (req: Request, res: Response) => {
  if (!requireDatabase(res)) return;
  try {
    const caller = await getSessionUser(req);
    if (!caller || caller.disabled) {
      res.status(401).send('An enabled signed-in account is required.');
      return;
    }
    if (!isSuperadmin(caller)) {
      res.status(403).send('Only superadmins can manage list access.');
      return;
    }
    const target = await pool!.query('SELECT 1 FROM users WHERE id = $1', [req.params.userId]);
    if (target.rowCount === 0) {
      res.status(404).send('User not found.');
      return;
    }
    const result = await pool!.query<{ list_id: string }>(
      'SELECT list_id FROM user_list_access WHERE user_id = $1 ORDER BY list_id',
      [req.params.userId],
    );
    res.json({ listIds: result.rows.map((row) => row.list_id) });
  } catch (error) {
    console.error('Unable to load user list access:', error);
    res.status(500).send('Unable to load user list access.');
  }
});

app.put('/api/admin/users/:userId/list-access', async (req: Request, res: Response) => {
  if (!requireDatabase(res)) return;
  let caller: DatabaseUser | null;
  try {
    caller = await getSessionUser(req);
  } catch (error) {
    console.error('Unable to authenticate list access update:', error);
    res.status(500).send('Unable to authenticate list access update.');
    return;
  }
  if (!caller || caller.disabled) {
    res.status(401).send('An enabled signed-in account is required.');
    return;
  }
  if (!isSuperadmin(caller)) {
    res.status(403).send('Only superadmins can manage list access.');
    return;
  }
  const listIds: unknown = req.body?.listIds;
  if (!Array.isArray(listIds) || !listIds.every((id) => typeof id === 'string')) {
    res.status(400).send('List IDs must be provided as an array of strings.');
    return;
  }

  let client: PoolClient;
  try {
    client = await pool!.connect();
  } catch (error) {
    console.error('Unable to connect to the database for list access update:', error);
    res.status(500).send('Unable to update user list access.');
    return;
  }
  try {
    await client.query('BEGIN');
    const target = await client.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [req.params.userId]);
    if (target.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).send('User not found.');
      return;
    }
    const uniqueListIds = [...new Set(listIds as string[])];
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM lists WHERE id = ANY($1::varchar[])',
      [uniqueListIds],
    );
    if (existing.rowCount !== uniqueListIds.length) {
      await client.query('ROLLBACK');
      res.status(400).send('One or more selected lists do not exist.');
      return;
    }
    await client.query('DELETE FROM user_list_access WHERE user_id = $1', [req.params.userId]);
    for (const listId of uniqueListIds) {
      await client.query(
        'INSERT INTO user_list_access (user_id, list_id, granted_by) VALUES ($1, $2, $3)',
        [req.params.userId, listId, caller.id],
      );
    }
    await client.query('COMMIT');
    res.json({ listIds: uniqueListIds });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Unable to save user list access:', error);
    res.status(500).send('Unable to save user list access.');
  } finally {
    client.release();
  }
});

app.post('/api/admin/lists/import', async (req: Request, res: Response) => {
  if (!requireDatabase(res)) return;
  try {
    const caller = await getSessionUser(req);
    if (!caller || caller.disabled) {
      res.status(401).send('An enabled signed-in account is required.');
      return;
    }
    if (!isSuperadmin(caller)) {
      res.status(403).send('Only superadmins can import existing lists.');
      return;
    }
    if (!Array.isArray(req.body?.lists)) {
      res.status(400).send('Lists must be provided as an array.');
      return;
    }

    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
      const migration = await client.query(
        `INSERT INTO app_migrations (name) VALUES ('browser_lists_imported')
         ON CONFLICT (name) DO NOTHING RETURNING name`,
      );
      if (migration.rowCount === 0) {
        await client.query('ROLLBACK');
        res.json({ imported: 0, alreadyImported: true });
        return;
      }

      let imported = 0;
      for (const rawList of req.body.lists) {
        if (
          !rawList ||
          typeof rawList !== 'object' ||
          typeof rawList.id !== 'string' ||
          !rawList.id.trim() ||
          rawList.id.length > 64 ||
          typeof rawList.name !== 'string' ||
          !rawList.name.trim() ||
          rawList.name.trim().length > 255 ||
          typeof rawList.category !== 'string' ||
          !rawList.category.trim() ||
          rawList.category.trim().length > 128 ||
          typeof rawList.creatorEmail !== 'string' ||
          rawList.creatorEmail.length > 255 ||
          typeof rawList.creatorName !== 'string'
        ) {
          throw new Error('An existing list has invalid data.');
        }
        const items = validateListItems(rawList.items);
        if (!items) throw new Error(`List "${rawList.name}" has invalid or duplicate items.`);
        const creator = await client.query<{ id: string }>(
          'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
          [rawList.creatorEmail],
        );
        const createdAt = new Date(rawList.createdAt);
        const updatedAt = new Date(rawList.updatedAt);
        const existingId = await client.query<{ id: string }>(
          'SELECT id FROM lists WHERE id = $1',
          [rawList.id],
        );
        let listId = rawList.id as string;
        if ((existingId.rowCount ?? 0) > 0) {
          await client.query(
            `UPDATE lists SET name = $1, category = $2, description = $3, creator_id = $4,
               creator_email = $5, creator_name = $6, creator_avatar = $7, is_public = $8,
               shuffle_count = $9, created_at = $10, updated_at = $11
             WHERE id = $12`,
            [
              rawList.name.trim(), rawList.category.trim(), rawList.description || null,
              creator.rows[0]?.id || null, rawList.creatorEmail, rawList.creatorName,
              rawList.creatorAvatar || null, false, Number(rawList.shuffleCount) || 0,
              Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
              Number.isNaN(updatedAt.getTime()) ? new Date() : updatedAt, rawList.id,
            ],
          );
        } else {
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO lists (
               id, name, category, description, creator_id, creator_email, creator_name,
               creator_avatar, is_public, shuffle_count, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT DO NOTHING RETURNING id`,
            [
              rawList.id, rawList.name.trim(), rawList.category.trim(), rawList.description || null,
              creator.rows[0]?.id || null, rawList.creatorEmail, rawList.creatorName,
              rawList.creatorAvatar || null, false, Number(rawList.shuffleCount) || 0,
              Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
              Number.isNaN(updatedAt.getTime()) ? new Date() : updatedAt,
            ],
          );
          if (inserted.rowCount === 0) continue;
        }
        await client.query('DELETE FROM list_items WHERE list_id = $1', [listId]);
        for (const [index, item] of items.entries()) {
          await client.query(
            `INSERT INTO list_items (id, list_id, text, selected, prioritized, sort_order, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [item.id, listId, item.text, item.selected, item.prioritized, index, new Date(item.createdAt)],
          );
        }
        imported += 1;
      }
      await client.query('COMMIT');
      res.json({ imported, alreadyImported: false });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Unable to import browser lists:', error);
    res.status(500).send(error instanceof Error ? error.message : 'Unable to import existing lists.');
  }
});

app.get('/api/lists', async (req: Request, res: Response) => {
  if (!requireDatabase(res)) return;
  try {
    const user = await getSessionUser(req);
    if (!user || user.disabled || user.role === 'pending') {
      res.status(403).send('An enabled, approved account is required.');
      return;
    }
    res.json(await getListsForUser(user));
  } catch (error) {
    console.error('Unable to load accessible lists:', error);
    res.status(500).send('Unable to load accessible lists.');
  }
});

app.post('/api/lists', async (req: Request, res: Response) => {
  if (!requireDatabase(res)) return;
  let user: DatabaseUser | null;
  try {
    user = await getSessionUser(req);
  } catch (error) {
    console.error('Unable to authenticate list creation:', error);
    res.status(500).send('Unable to authenticate list creation.');
    return;
  }
  if (!user || user.disabled || user.role === 'pending') {
    res.status(403).send('An enabled, approved account is required.');
    return;
  }
  if (!isSuperadmin(user) && user.role !== 'admin') {
    res.status(403).send('Admin access is required to create lists.');
    return;
  }
  const { name, category, description } = req.body ?? {};
  const items = validateListItems(req.body?.items);
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 255) {
    res.status(400).send('List name must be between 1 and 255 characters.');
    return;
  }
  if (typeof category !== 'string' || !category.trim() || category.trim().length > 128) {
    res.status(400).send('A valid list category is required.');
    return;
  }
  if (typeof description !== 'string' || !items || items.length === 0) {
    res.status(400).send('A description and at least one valid, distinct item are required.');
    return;
  }

  let client: PoolClient;
  try {
    client = await pool!.connect();
  } catch (error) {
    console.error('Unable to connect to the database for list creation:', error);
    res.status(500).send('Unable to create list.');
    return;
  }
  const listId = randomUUID();
  const now = new Date();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO lists (
         id, name, category, description, creator_id, creator_email, creator_name,
         creator_avatar, is_public, shuffle_count
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, 0)`,
      [listId, name.trim(), category.trim(), description.trim(), user.id, user.email, user.name, user.avatar || null],
    );
    for (const [index, item] of items.entries()) {
      await client.query(
        `INSERT INTO list_items (id, list_id, text, selected, prioritized, sort_order, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [item.id, listId, item.text, item.selected, item.prioritized, index, new Date(item.createdAt)],
      );
    }
    await client.query('COMMIT');
    res.status(201).json({
      id: listId, name: name.trim(), category: category.trim(), description: description.trim(),
      items, creatorId: user.id, creatorEmail: user.email, creatorName: user.name,
      creatorAvatar: user.avatar, isPublic: false, createdAt: now.toISOString(),
      updatedAt: now.toISOString(), shuffleCount: 0,
    } satisfies ShuffleList);
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string }).code === '23505') {
      res.status(409).send('A list with that name already exists.');
      return;
    }
    console.error('Unable to create list:', error);
    res.status(500).send('Unable to create list.');
  } finally {
    client.release();
  }
});

app.patch('/api/lists/:listId', async (req: Request, res: Response) => {
  if (!requireDatabase(res)) return;
  let user: DatabaseUser | null;
  try {
    user = await getSessionUser(req);
  } catch (error) {
    console.error('Unable to authenticate list update:', error);
    res.status(500).send('Unable to authenticate list update.');
    return;
  }
  if (!user || user.disabled || user.role === 'pending') {
    res.status(403).send('An enabled, approved account is required.');
    return;
  }
  let client: PoolClient;
  try {
    client = await pool!.connect();
  } catch (error) {
    console.error('Unable to connect to the database for list update:', error);
    res.status(500).send('Unable to update list.');
    return;
  }
  try {
    await client.query('BEGIN');
    const existing = await client.query<{
      creator_email: string;
    }>('SELECT creator_email FROM lists WHERE id = $1 FOR UPDATE', [req.params.listId]);
    if (existing.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).send('List not found.');
      return;
    }
    if (!(await getListAccess(user, req.params.listId))) {
      await client.query('ROLLBACK');
      res.status(404).send('List not found.');
      return;
    }
    if (!isSuperadmin(user) && existing.rows[0].creator_email.toLowerCase() !== user.email.toLowerCase()) {
      await client.query('ROLLBACK');
      res.status(403).send('Only the list creator or superadmin can edit this list.');
      return;
    }
    const { name, category, description } = req.body ?? {};
    const items = validateListItems(req.body?.items);
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 255) {
      await client.query('ROLLBACK');
      res.status(400).send('List name must be between 1 and 255 characters.');
      return;
    }
    if (typeof category !== 'string' || !category.trim() || category.trim().length > 128) {
      await client.query('ROLLBACK');
      res.status(400).send('A valid list category is required.');
      return;
    }
    if (typeof description !== 'string' || !items || items.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).send('A description and at least one valid, distinct item are required.');
      return;
    }
    await client.query(
      `UPDATE lists SET name = $1, category = $2, description = $3, updated_at = NOW()
       WHERE id = $4`,
      [name.trim(), category.trim(), description.trim(), req.params.listId],
    );
    await client.query('DELETE FROM list_items WHERE list_id = $1', [req.params.listId]);
    for (const [index, item] of items.entries()) {
      await client.query(
        `INSERT INTO list_items (id, list_id, text, selected, prioritized, sort_order, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [item.id, req.params.listId, item.text, item.selected, item.prioritized, index, new Date(item.createdAt)],
      );
    }
    await client.query('COMMIT');
    res.json({
      id: req.params.listId, name: name.trim(), category: category.trim(), description: description.trim(),
      items, updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string }).code === '23505') {
      res.status(409).send('A list with that name or item already exists.');
      return;
    }
    console.error('Unable to update list:', error);
    res.status(500).send('Unable to update list.');
  } finally {
    client.release();
  }
});

app.delete('/api/lists/:listId', async (req: Request, res: Response) => {
  if (!requireDatabase(res)) return;
  try {
    const user = await getSessionUser(req);
    if (!user || user.disabled || user.role === 'pending') {
      res.status(403).send('An enabled, approved account is required.');
      return;
    }
    const existing = await pool!.query<{ creator_email: string }>(
      'SELECT creator_email FROM lists WHERE id = $1',
      [req.params.listId],
    );
    if (existing.rowCount === 0) {
      res.status(404).send('List not found.');
      return;
    }
    if (!(await getListAccess(user, req.params.listId))) {
      res.status(404).send('List not found.');
      return;
    }
    if (!isSuperadmin(user) && existing.rows[0].creator_email.toLowerCase() !== user.email.toLowerCase()) {
      res.status(403).send('Only the list creator or superadmin can delete this list.');
      return;
    }
    await pool!.query('DELETE FROM lists WHERE id = $1', [req.params.listId]);
    res.status(204).end();
  } catch (error) {
    console.error('Unable to delete list:', error);
    res.status(500).send('Unable to delete list.');
  }
});

app.patch('/api/lists/:listId/items/:itemId', async (req: Request, res: Response) => {
  if (!requireDatabase(res)) return;
  try {
    const user = await getSessionUser(req);
    if (!user || user.disabled || user.role === 'pending') {
      res.status(403).send('An enabled, approved account is required.');
      return;
    }
    const list = await pool!.query<{ creator_email: string }>(
      'SELECT creator_email FROM lists WHERE id = $1',
      [req.params.listId],
    );
    if (list.rowCount === 0) {
      res.status(404).send('List not found.');
      return;
    }
    if (!(await getListAccess(user, req.params.listId))) {
      res.status(404).send('List not found.');
      return;
    }
    if (!isSuperadmin(user) && list.rows[0].creator_email.toLowerCase() !== user.email.toLowerCase()) {
      res.status(403).send('Only the list creator or superadmin can edit list items.');
      return;
    }
    const updates: string[] = [];
    const values: (string | boolean)[] = [];
    for (const field of ['selected', 'prioritized'] as const) {
      if (req.body?.[field] !== undefined) {
        if (typeof req.body[field] !== 'boolean') {
          res.status(400).send(`${field} must be true or false.`);
          return;
        }
        values.push(req.body[field]);
        updates.push(`${field} = $${values.length}`);
      }
    }
    if (!updates.length) {
      res.status(400).send('At least one item property is required.');
      return;
    }
    values.push(req.params.itemId, req.params.listId);
    const result = await pool!.query(
      `UPDATE list_items SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND list_id = $${values.length}`,
      values,
    );
    if (result.rowCount === 0) {
      res.status(404).send('List item not found.');
      return;
    }
    const updatedLists = await getListsForUser(user);
    res.json(updatedLists.find((item) => item.id === req.params.listId) ?? null);
  } catch (error) {
    console.error('Unable to update list item:', error);
    res.status(500).send('Unable to update list item.');
  }
});

app.patch('/api/lists/:listId/items', async (req: Request, res: Response) => {
  if (!requireDatabase(res)) return;
  try {
    const user = await getSessionUser(req);
    if (!user || user.disabled || user.role === 'pending') {
      res.status(403).send('An enabled, approved account is required.');
      return;
    }
    const list = await pool!.query<{ creator_email: string }>(
      'SELECT creator_email FROM lists WHERE id = $1',
      [req.params.listId],
    );
    if (list.rowCount === 0) {
      res.status(404).send('List not found.');
      return;
    }
    if (!(await getListAccess(user, req.params.listId))) {
      res.status(404).send('List not found.');
      return;
    }
    if (!isSuperadmin(user) && list.rows[0].creator_email.toLowerCase() !== user.email.toLowerCase()) {
      res.status(403).send('Only the list creator or superadmin can edit list items.');
      return;
    }
    if (typeof req.body?.selected !== 'boolean') {
      res.status(400).send('Selected must be true or false.');
      return;
    }
    await pool!.query(
      'UPDATE list_items SET selected = $1 WHERE list_id = $2',
      [req.body.selected, req.params.listId],
    );
    const updatedLists = await getListsForUser(user);
    res.json(updatedLists.find((item) => item.id === req.params.listId) ?? null);
  } catch (error) {
    console.error('Unable to update list item selection:', error);
    res.status(500).send('Unable to update list item selection.');
  }
});

app.post('/api/lists/:listId/shuffle', async (req: Request, res: Response) => {
  if (!requireDatabase(res)) return;
  try {
    const user = await getSessionUser(req);
    if (!user || user.disabled || user.role === 'pending') {
      res.status(403).send('An enabled, approved account is required.');
      return;
    }
    if (!(await getListAccess(user, req.params.listId))) {
      res.status(404).send('List not found.');
      return;
    }
    const result = await pool!.query(
      'UPDATE lists SET shuffle_count = shuffle_count + 1, updated_at = NOW() WHERE id = $1',
      [req.params.listId],
    );
    if (result.rowCount === 0) {
      res.status(404).send('List not found.');
      return;
    }
    res.status(204).end();
  } catch (error) {
    console.error('Unable to record list shuffle:', error);
    res.status(500).send('Unable to record list shuffle.');
  }
});

app.get('/api/admin/categories', async (req: Request, res: Response) => {
  if (!requireDatabase(res)) return;
  try {
    const user = await getSessionUser(req);
    if (!user || user.disabled || user.role === 'pending') {
      res.status(403).send('An enabled, approved account is required.');
      return;
    }
    const result = await pool!.query<DatabaseCategory>(
      'SELECT id, name, icon, color FROM categories ORDER BY name',
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Unable to load categories:', error);
    res.status(500).send('Unable to load categories.');
  }
});

app.post('/api/admin/categories', async (req: Request, res: Response) => {
  if (!requireDatabase(res)) return;
  try {
    const user = await getSessionUser(req);
    if (!user || user.disabled || user.role === 'pending') {
      res.status(403).send('An enabled, approved account is required to create categories.');
      return;
    }
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 128) {
      res.status(400).send('Category name must be between 1 and 128 characters.');
      return;
    }

    const result = await pool!.query<DatabaseCategory>(
      'INSERT INTO categories (id, name, icon, color) VALUES ($1, $2, $3, $4) RETURNING id, name, icon, color',
      [randomUUID(), name, 'Tag', 'indigo'],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      res.status(409).send('A category with that name already exists.');
      return;
    }
    console.error('Unable to create category:', error);
    res.status(500).send('Unable to create category.');
  }
});

app.patch('/api/admin/categories/:categoryId', async (req: Request, res: Response) => {
  if (!requireDatabase(res)) return;
  try {
    const user = await getSessionUser(req);
    if (!user || user.disabled) {
      res.status(401).send('An enabled signed-in account is required.');
      return;
    }
    if (!isSuperadmin(user)) {
      res.status(403).send('Only superadmins can manage categories.');
      return;
    }
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 128) {
      res.status(400).send('Category name must be between 1 and 128 characters.');
      return;
    }

    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
      const previous = await client.query<{ name: string }>(
        'SELECT name FROM categories WHERE id = $1 FOR UPDATE',
        [req.params.categoryId],
      );
      if (previous.rowCount === 0) {
        await client.query('ROLLBACK');
        res.status(404).send('Category not found.');
        return;
      }
      const result = await client.query<DatabaseCategory>(
        'UPDATE categories SET name = $1 WHERE id = $2 RETURNING id, name, icon, color',
        [name, req.params.categoryId],
      );
      await client.query('UPDATE lists SET category = $1 WHERE category = $2', [name, previous.rows[0].name]);
      await client.query('COMMIT');
      res.json(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      res.status(409).send('A category with that name already exists.');
      return;
    }
    console.error('Unable to rename category:', error);
    res.status(500).send('Unable to rename category.');
  }
});

app.delete('/api/admin/categories/:categoryId', async (req: Request, res: Response) => {
  if (!requireDatabase(res)) return;
  try {
    const user = await getSessionUser(req);
    if (!user || user.disabled) {
      res.status(401).send('An enabled signed-in account is required.');
      return;
    }
    if (!isSuperadmin(user)) {
      res.status(403).send('Only superadmins can manage categories.');
      return;
    }

    const result = await pool!.query('DELETE FROM categories WHERE id = $1', [req.params.categoryId]);
    if (result.rowCount === 0) {
      res.status(404).send('Category not found.');
      return;
    }
    res.status(204).end();
  } catch (error) {
    console.error('Unable to delete category:', error);
    res.status(500).send('Unable to delete category.');
  }
});

app.post('/api/auth/logout', (_req: Request, res: Response) => {
  res.setHeader('Set-Cookie', `${sessionCookieName}=; ${cookieOptions(0)}`);
  res.status(204).end();
});

// Health Check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    app: 'Shuffle',
    version: '1.0.0',
    superadmin: SUPERADMIN_EMAIL,
    environment: process.env.NODE_ENV || 'development',
  });
});

// Production: serve built static files from dist
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req: Request, res: Response, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Start listener if executed directly
if (process.env.NODE_ENV === 'production' || !process.env.VITE) {
  const startServer = async () => {
    if (pool) {
      await pool.query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE users ALTER COLUMN role SET DEFAULT 'pending';
        CREATE UNIQUE INDEX IF NOT EXISTS categories_name_lower_unique ON categories (LOWER(name));
        CREATE TABLE IF NOT EXISTS user_list_access (
          user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          list_id VARCHAR(64) NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
          granted_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
          granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, list_id)
        );
        CREATE TABLE IF NOT EXISTS app_migrations (
          name VARCHAR(128) PRIMARY KEY,
          completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS lists_name_lower_unique ON lists (LOWER(name));
        UPDATE lists SET is_public = FALSE WHERE is_public IS DISTINCT FROM FALSE;
        ALTER TABLE lists ALTER COLUMN is_public SET DEFAULT FALSE;
        ALTER TABLE lists ALTER COLUMN is_public SET NOT NULL;
      `);
    }
    app.listen(port, () => {
      console.log(`Shuffle backend server listening on port ${port}`);
    });
  };
  startServer().catch((error: unknown) => {
    console.error('Unable to initialize the application database:', error);
    process.exitCode = 1;
  });
}

export default app;
