-- User profiles: module visibility per profile (UI navigation)
CREATE TABLE IF NOT EXISTS user_profiles (
  id serial PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  modules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_slug_uq ON user_profiles(slug);
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_name_uq ON user_profiles(name);

ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_id integer REFERENCES user_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS users_profile_id_idx ON users(profile_id);
