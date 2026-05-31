-- Add permissionsJson column to users table
-- Enables granular permission overrides per user (v0.3.0)

ALTER TABLE users
ADD COLUMN IF NOT EXISTS permissions_json JSONB DEFAULT NULL;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'permissions_json'
      AND data_type = 'json'
  ) THEN
    ALTER TABLE users
      ALTER COLUMN permissions_json TYPE jsonb
      USING permissions_json::jsonb;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_permissions_json_idx ON users USING gin(permissions_json);
