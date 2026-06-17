CREATE TABLE IF NOT EXISTS config_generator_id_ranges (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  site_id INTEGER,
  range_key TEXT NOT NULL,
  id_type TEXT NOT NULL,
  service_type TEXT,
  range_start INTEGER NOT NULL,
  range_end INTEGER NOT NULL,
  reserved BOOLEAN NOT NULL DEFAULT FALSE,
  policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'builtin',
  version TEXT NOT NULL DEFAULT '2026.05',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT config_generator_id_ranges_tenant_range_key_uq UNIQUE (tenant_id, range_key, id_type)
);

CREATE INDEX IF NOT EXISTS config_generator_id_ranges_tenant_type_idx
  ON config_generator_id_ranges(tenant_id, id_type);

CREATE INDEX IF NOT EXISTS config_generator_id_ranges_tenant_service_idx
  ON config_generator_id_ranges(tenant_id, id_type, service_type);

CREATE TABLE IF NOT EXISTS config_generator_discovered_ids (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id INTEGER,
  site_code TEXT,
  device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  id_type TEXT NOT NULL,
  id_value INTEGER NOT NULL,
  parent_interface TEXT,
  interface_name TEXT,
  service_type TEXT,
  service_name TEXT,
  circuit_id TEXT,
  customer_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL,
  evidence_ref TEXT,
  first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  confidence TEXT NOT NULL DEFAULT 'medium',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT config_generator_discovered_ids_dedupe_uq UNIQUE (
    tenant_id,
    device_id,
    id_type,
    id_value,
    parent_interface,
    interface_name
  )
);

CREATE INDEX IF NOT EXISTS config_generator_discovered_ids_tenant_type_value_idx
  ON config_generator_discovered_ids(tenant_id, id_type, id_value);

CREATE INDEX IF NOT EXISTS config_generator_discovered_ids_tenant_site_type_value_idx
  ON config_generator_discovered_ids(tenant_id, site_code, id_type, id_value);

CREATE INDEX IF NOT EXISTS config_generator_discovered_ids_tenant_device_type_value_idx
  ON config_generator_discovered_ids(tenant_id, device_id, id_type, id_value);

CREATE INDEX IF NOT EXISTS config_generator_discovered_ids_tenant_type_service_idx
  ON config_generator_discovered_ids(tenant_id, id_type, service_type);

CREATE INDEX IF NOT EXISTS config_generator_discovered_ids_tenant_type_status_idx
  ON config_generator_discovered_ids(tenant_id, id_type, status);
