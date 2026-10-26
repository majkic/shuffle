-- Shuffle App Database Initialization Script for PostgreSQL

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    avatar TEXT,
    role VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'superadmin', 'admin', 'viewer', 'pending'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ALTER COLUMN role SET DEFAULT 'pending';
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS categories (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL UNIQUE,
    icon VARCHAR(64) DEFAULT 'Tag',
    color VARCHAR(32) DEFAULT 'indigo'
);

CREATE UNIQUE INDEX IF NOT EXISTS categories_name_lower_unique ON categories (LOWER(name));

CREATE TABLE IF NOT EXISTS lists (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE, -- Distinct list name constraint
    category VARCHAR(128) NOT NULL,
    description TEXT,
    creator_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    creator_email VARCHAR(255) NOT NULL,
    creator_name VARCHAR(255) NOT NULL,
    creator_avatar TEXT,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    shuffle_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS list_items (
    id VARCHAR(64) PRIMARY KEY,
    list_id VARCHAR(64) REFERENCES lists(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    selected BOOLEAN DEFAULT TRUE, -- All elements selected by default
    prioritized BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_item_text_per_list UNIQUE (list_id, text) -- Distinct element constraint
);

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

CREATE TABLE IF NOT EXISTS shuffle_history (
    id VARCHAR(64) PRIMARY KEY,
    list_id VARCHAR(64) REFERENCES lists(id) ON DELETE CASCADE,
    shuffled_by_email VARCHAR(255),
    items_count INTEGER NOT NULL,
    prioritized_count INTEGER NOT NULL,
    shuffled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial Superadmin: majkic@gmail.com
INSERT INTO users (id, email, name, role)
VALUES 
    ('user-superadmin', 'majkic@gmail.com', 'Majkic', 'superadmin'),
    ('user-admin-1', 'sarah.lead@shuffle.io', 'Sarah Connor', 'admin'),
    ('user-admin-2', 'david.chef@shuffle.io', 'David Miller', 'admin')
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role;

-- Seed initial Categories
INSERT INTO categories (id, name, icon, color)
VALUES
    ('work', 'Work & Projects', 'Briefcase', 'indigo'),
    ('team', 'Team & Culture', 'Users', 'emerald'),
    ('education', 'Education & Study', 'GraduationCap', 'blue'),
    ('kitchen', 'Kitchen & Dining', 'Utensils', 'amber'),
    ('entertainment', 'Games & Fun', 'Gamepad2', 'purple')
ON CONFLICT (id) DO NOTHING;

-- Seed initial List
INSERT INTO lists (id, name, category, description, creator_id, creator_email, creator_name, shuffle_count)
VALUES 
    ('list-team-standup', 'Weekly Team Standup Icebreakers', 'Team & Culture', 'Kick off Monday standups with positive energy.', 'user-superadmin', 'majkic@gmail.com', 'Majkic', 38)
ON CONFLICT (id) DO NOTHING;

INSERT INTO list_items (id, list_id, text, selected, prioritized, sort_order)
VALUES 
    ('i-1', 'list-team-standup', 'Share one major achievement from this past week', TRUE, TRUE, 1),
    ('i-2', 'list-team-standup', 'What is your top blocker right now that team can help with?', TRUE, TRUE, 2),
    ('i-3', 'list-team-standup', 'If you could have any superpower for 24 hours, what would it be?', TRUE, FALSE, 3),
    ('i-4', 'list-team-standup', 'Favorite meal or snack you discovered recently', TRUE, FALSE, 4),
    ('i-5', 'list-team-standup', 'What book, podcast, or series are you currently enjoying?', TRUE, FALSE, 5)
ON CONFLICT (id) DO NOTHING;
