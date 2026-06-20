CREATE TABLE IF NOT EXISTS user_access_profiles (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  permissions_json JSON NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_access_profiles_tenant_name_uq ON user_access_profiles(tenant_id, name);
CREATE INDEX IF NOT EXISTS user_access_profiles_tenant_id_idx ON user_access_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS user_access_profiles_is_default_idx ON user_access_profiles(is_default);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_id INTEGER REFERENCES user_access_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_profile_id_idx ON users(profile_id);
