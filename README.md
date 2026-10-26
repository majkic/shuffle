<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/f8543c16-05b2-4a0e-ac86-7ca6307855eb

## Configuration

Copy `.env.example` to `.env` for development, or `.env.production.example` to `.env.production` for production, then fill in your values. Real environment files are ignored by Git; do not commit them. Use unique, strong passwords and session secrets in production.

Google sign-in uses a server-side OAuth authorization-code flow. Create a Google OAuth 2.0 **Web application** client and register the exact callback URLs in Google Cloud Console under **Authorized redirect URIs**:

- `http://localhost:3005/api/auth/google/callback` for `./deploy.sh dev`
- `http://localhost:3010/api/auth/google/callback` for running the separate local auth server with `npm run dev:auth`
- `https://shuffle.ll.rs/api/auth/google/callback` for production

The URI sent by Google must exactly match one of the registered entries, including scheme, host, port, and path. Add `http://localhost:3005` under **Authorized JavaScript origins** for local development if Google requests an origin. Save the client ID and client secret in your environment file; the secret is only read by the server and must never use a `VITE_` prefix. For production, set `GOOGLE_REDIRECT_URI` to the public HTTPS callback URL and `APP_URL` to the public app URL.

The development frontend runs on port `3005`, and its OAuth backend runs on port `3010`. Production serves both the frontend and OAuth callback from port `3005` by default. In production, use a TLS reverse proxy for the public HTTPS URL and route traffic to port `3005`.

For local development, start the authentication server and Vite in separate terminals:

1. Start the authentication server: `npm run dev:auth`
2. Start the app: `npm run dev`

For production, build the frontend and start the server:

1. Build the frontend: `npm run build`
2. Start the production server: `npm run start:prod`

`start:prod` loads `.env.production`. Generate a long random session key (for example, `openssl rand -hex 32`) and set it as `SESSION_SECRET`.

Google sign-ins are registered in PostgreSQL with `pending` access by default. The primary superadmin can approve a user as a viewer or admin in **Admin Panel → User Access**. Changes take effect when that user refreshes or checks their approval status. Run `./deploy.sh dev` to start the local database needed by Google sign-in.

The superadmin panel also supports shared category creation, renaming, and deletion, plus disabling, re-enabling, and deleting user accounts. Deleting an account preserves its lists, but removes the account association. The primary superadmin cannot be disabled or deleted.

Lists are stored in PostgreSQL and are private to the superadmin by default. In **Admin Panel → User Access → Manage lists**, the superadmin can grant individual users view-and-shuffle access to selected lists; users cannot see unassigned lists, and existing creator/superadmin editing rules remain in effect. The first superadmin sign-in imports lists from that browser’s local storage once per database.

Docker Compose reads values from `.env` by default. For production, pass `--env-file .env.production` to Docker Compose. Configure these values:

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`: PostgreSQL credentials and database name
- `SUPERADMIN_EMAIL`: email address configured as the superadmin
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google OAuth web client credentials
- `GOOGLE_REDIRECT_URI`: registered Google OAuth callback URL
- `APP_URL`: URL to return to after sign-in
- `SESSION_SECRET`: random key used to sign the HTTP-only login session cookie
- `DATABASE_URL`: PostgreSQL connection string used to persist Google users and approvals
- `DEPLOY_HOST`, `DEPLOY_PATH`: SSH destination and application directory used by `deploy.sh prod`
- `APP_PORT`, `POSTGRES_PORT`: host ports published by Docker Compose

## Deploy

Run `./deploy.sh dev` to build and start the app and database in local Docker Compose on `http://localhost:3005`. The database is published on port `5435` by default. Run `./deploy.sh prod` to sync the project and `.env.production` to `DEPLOY_HOST` (default `root@ll.rs`, configured in `.env.production`) and build/start the `shuffle-prod` Compose project remotely. Production deployment requires `.env.production` with `APP_URL=https://shuffle.ll.rs` and `GOOGLE_REDIRECT_URI=https://shuffle.ll.rs/api/auth/google/callback`; copy `.env.production.example` and set real secrets first. The remote host needs SSH access, `rsync`, and Docker Compose. Configure the HTTPS reverse proxy for `shuffle.ll.rs` to forward to port `3005` before deploying.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and add your Google OAuth credentials.
3. Start the auth server and Vite as described above.
