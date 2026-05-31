CREATE TABLE IF NOT EXISTS credential_profiles (
  id text PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  vendor text,
  username text,
  encrypted_secret text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT credential_profiles_type_chk CHECK (type IN ('SSH', 'SNMP_V2', 'SNMP_V3', 'NETCONF', 'API_TOKEN'))
);

CREATE UNIQUE INDEX IF NOT EXISTS credential_profiles_tenant_name_uq
  ON credential_profiles(tenant_id, name);
CREATE INDEX IF NOT EXISTS credential_profiles_tenant_type_idx
  ON credential_profiles(tenant_id, type);
CREATE INDEX IF NOT EXISTS credential_profiles_active_idx
  ON credential_profiles(is_active);

CREATE TABLE IF NOT EXISTS credential_assignments (
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  credential_profile_id text NOT NULL REFERENCES credential_profiles(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS credential_assignments_device_profile_uq
  ON credential_assignments(device_id, credential_profile_id);
CREATE INDEX IF NOT EXISTS credential_assignments_device_priority_idx
  ON credential_assignments(device_id, priority);

CREATE TABLE IF NOT EXISTS credential_audit_logs (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  credential_profile_id text REFERENCES credential_profiles(id) ON DELETE SET NULL,
  device_id integer REFERENCES devices(id) ON DELETE SET NULL,
  actor_id integer REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  metadata_json jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credential_audit_logs_profile_idx
  ON credential_audit_logs(credential_profile_id);
CREATE INDEX IF NOT EXISTS credential_audit_logs_device_idx
  ON credential_audit_logs(device_id);
CREATE INDEX IF NOT EXISTS credential_audit_logs_action_idx
  ON credential_audit_logs(action);
CREATE INDEX IF NOT EXISTS credential_audit_logs_created_at_idx
  ON credential_audit_logs(created_at);
