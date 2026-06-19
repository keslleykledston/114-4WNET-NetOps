-- VSI/VPLS library: consolidated service state, members, configs and history.

CREATE TABLE IF NOT EXISTS vsi_services (
  id SERIAL PRIMARY KEY,
  service_key TEXT NOT NULL,
  tenant_id INTEGER,
  tenant_name TEXT NOT NULL,
  vs_id TEXT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  status TEXT NOT NULL,
  severity TEXT NOT NULL,
  sites_count INTEGER NOT NULL DEFAULT 0,
  devices_count INTEGER NOT NULL DEFAULT 0,
  acs_count INTEGER NOT NULL DEFAULT 0,
  pws_count INTEGER NOT NULL DEFAULT 0,
  pws_up_count INTEGER NOT NULL DEFAULT 0,
  alarms_count INTEGER NOT NULL DEFAULT 0,
  has_divergence BOOLEAN NOT NULL DEFAULT FALSE,
  first_seen_at TIMESTAMP,
  last_seen_at TIMESTAMP,
  last_collected_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS vsi_services_service_key_uq ON vsi_services(service_key);
CREATE INDEX IF NOT EXISTS vsi_services_tenant_id_idx ON vsi_services(tenant_id);
CREATE INDEX IF NOT EXISTS vsi_services_vs_id_idx ON vsi_services(vs_id);
CREATE INDEX IF NOT EXISTS vsi_services_status_idx ON vsi_services(status);
CREATE INDEX IF NOT EXISTS vsi_services_last_collected_at_idx ON vsi_services(last_collected_at);

CREATE TABLE IF NOT EXISTS vsi_service_members (
  id SERIAL PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES vsi_services(id) ON DELETE CASCADE,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  site TEXT NOT NULL,
  vendor TEXT NOT NULL,
  circuit_id INTEGER NOT NULL,
  circuit_type TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  vs_id TEXT,
  vsi_name TEXT,
  source TEXT NOT NULL,
  admin_status TEXT NOT NULL,
  oper_status TEXT NOT NULL,
  pw_status TEXT,
  local_interface TEXT,
  parent_interface TEXT,
  peer_ip TEXT,
  peer_ips_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  peers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  pw_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  outer_vlan INTEGER,
  inner_vlan INTEGER,
  mac_count INTEGER,
  findings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at TIMESTAMP NOT NULL,
  last_seen_at TIMESTAMP NOT NULL,
  raw_evidence TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS vsi_service_members_service_device_uq ON vsi_service_members(service_id, device_id);
CREATE INDEX IF NOT EXISTS vsi_service_members_service_id_idx ON vsi_service_members(service_id);
CREATE INDEX IF NOT EXISTS vsi_service_members_device_id_idx ON vsi_service_members(device_id);

CREATE TABLE IF NOT EXISTS vsi_service_configs (
  id SERIAL PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES vsi_services(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES vsi_service_members(id) ON DELETE CASCADE,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  collected_at TIMESTAMP NOT NULL,
  parser_status TEXT,
  source TEXT,
  raw_config TEXT,
  config_hash TEXT,
  command_used TEXT,
  parser_version TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vsi_service_configs_service_id_idx ON vsi_service_configs(service_id);
CREATE INDEX IF NOT EXISTS vsi_service_configs_member_id_idx ON vsi_service_configs(member_id);
CREATE INDEX IF NOT EXISTS vsi_service_configs_device_id_idx ON vsi_service_configs(device_id);

CREATE TABLE IF NOT EXISTS vsi_service_status_history (
  id SERIAL PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES vsi_services(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  severity TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  collected_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vsi_service_status_history_service_id_idx ON vsi_service_status_history(service_id);
CREATE INDEX IF NOT EXISTS vsi_service_status_history_collected_at_idx ON vsi_service_status_history(collected_at);

CREATE TABLE IF NOT EXISTS vsi_service_events (
  id SERIAL PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES vsi_services(id) ON DELETE CASCADE,
  device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  message TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vsi_service_events_service_id_idx ON vsi_service_events(service_id);
CREATE INDEX IF NOT EXISTS vsi_service_events_device_id_idx ON vsi_service_events(device_id);
CREATE INDEX IF NOT EXISTS vsi_service_events_event_type_idx ON vsi_service_events(event_type);
CREATE INDEX IF NOT EXISTS vsi_service_events_created_at_idx ON vsi_service_events(created_at);
