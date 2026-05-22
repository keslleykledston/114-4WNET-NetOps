-- Add permissionsJson column to users table
-- Enables granular permission overrides per user (v0.3.0)

ALTER TABLE users
ADD COLUMN permissions_json JSONB DEFAULT NULL;

CREATE INDEX users_permissions_json_idx ON users USING gin(permissions_json);
