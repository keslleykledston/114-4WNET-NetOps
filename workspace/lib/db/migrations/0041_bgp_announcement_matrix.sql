-- BGP Announcement Matrix: upstream circuits, action catalog, targets, community sets, change plans

CREATE TABLE IF NOT EXISTS bgp_upstream_circuits (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  circuit_id VARCHAR(4) NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  short_name VARCHAR(64),
  role VARCHAR(32) NOT NULL DEFAULT 'provider',
  remote_as INTEGER,
  local_as INTEGER,
  peer_ip VARCHAR(64),
  peer_group_name VARCHAR(128),
  import_policy_v4_name VARCHAR(200),
  import_policy_v6_name VARCHAR(200),
  export_policy_v4_name VARCHAR(200),
  export_policy_v6_name VARCHAR(200),
  export_policy_name VARCHAR(200),
  community_namespace VARCHAR(32) DEFAULT '5',
  community_base_asn INTEGER DEFAULT 64777,
  enabled_for_matrix BOOLEAN NOT NULL DEFAULT TRUE,
  audit_only BOOLEAN NOT NULL DEFAULT TRUE,
  modifiable BOOLEAN NOT NULL DEFAULT FALSE,
  source VARCHAR(40) NOT NULL DEFAULT 'discovered',
  confidence VARCHAR(16) NOT NULL DEFAULT 'medium',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bgp_upstream_circuit_device_cid
  ON bgp_upstream_circuits(device_id, circuit_id);
CREATE INDEX IF NOT EXISTS bgp_upstream_circuits_device_id_idx
  ON bgp_upstream_circuits(device_id);

CREATE TABLE IF NOT EXISTS bgp_community_action_catalog (
  id SERIAL PRIMARY KEY,
  action_code VARCHAR(4) NOT NULL,
  label VARCHAR(16) NOT NULL,
  state VARCHAR(16) NOT NULL,
  prepend_count INTEGER,
  total_as_path_count INTEGER,
  direction VARCHAR(16) DEFAULT 'export',
  description_short VARCHAR(128),
  description_full TEXT,
  is_destructive BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bgp_community_action_code
  ON bgp_community_action_catalog(action_code);

INSERT INTO bgp_community_action_catalog
  (action_code, label, state, prepend_count, total_as_path_count, description_short, is_destructive)
VALUES
  ('00', 'Rx', 'received', NULL, NULL, 'Rota recebida', FALSE),
  ('01', 'On', 'on', 0, 1, 'Anunciar sem prepend', FALSE),
  ('02', 'P1', 'p1', 1, 2, '+1 prepend', FALSE),
  ('03', 'P2', 'p2', 2, 3, '+2 prepends', FALSE),
  ('04', 'P3', 'p3', 3, 4, '+3 prepends', FALSE),
  ('05', 'P4', 'p4', 4, 5, '+4 prepends', FALSE),
  ('08', 'NE', 'no_export', NULL, NULL, 'No-export', FALSE),
  ('09', 'Def', 'default', NULL, NULL, 'Default', FALSE),
  ('66', 'BH', 'blackhole', NULL, NULL, 'Blackhole', TRUE),
  ('67', 'Off', 'off', NULL, NULL, 'Bloquear anúncio', TRUE)
ON CONFLICT (action_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS bgp_announcement_targets (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  target_type VARCHAR(16) NOT NULL,
  target_name VARCHAR(200) NOT NULL,
  family VARCHAR(8) NOT NULL,
  prefix VARCHAR(64),
  customer_asn INTEGER,
  route_policy_name VARCHAR(200) NOT NULL,
  node INTEGER,
  match_type VARCHAR(32),
  prefix_list_name VARCHAR(128),
  expanded_prefixes_json JSONB,
  modifiable BOOLEAN NOT NULL DEFAULT TRUE,
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  risk_level VARCHAR(16) NOT NULL DEFAULT 'low',
  source VARCHAR(40) NOT NULL,
  confidence VARCHAR(16) NOT NULL DEFAULT 'medium',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bgp_announcement_targets_device_id_idx
  ON bgp_announcement_targets(device_id);
CREATE INDEX IF NOT EXISTS bgp_announcement_targets_policy_idx
  ON bgp_announcement_targets(device_id, route_policy_name);

CREATE TABLE IF NOT EXISTS bgp_community_sets (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  communities_json JSONB NOT NULL,
  normalized_hash VARCHAR(64) NOT NULL,
  semantic_summary_json JSONB,
  source VARCHAR(40) NOT NULL DEFAULT 'discovered',
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bgp_community_sets_device_name
  ON bgp_community_sets(device_id, name);
CREATE INDEX IF NOT EXISTS bgp_community_sets_hash_idx
  ON bgp_community_sets(device_id, normalized_hash);

CREATE TABLE IF NOT EXISTS bgp_announcement_change_plans (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  target_policy_name VARCHAR(200) NOT NULL,
  target_type VARCHAR(16) NOT NULL,
  family VARCHAR(8) NOT NULL,
  node INTEGER NOT NULL,
  upstream_circuit_id VARCHAR(4) NOT NULL,
  upstream_name VARCHAR(128),
  old_state VARCHAR(16),
  new_state VARCHAR(16) NOT NULL,
  old_communities_json JSONB,
  new_communities_json JSONB,
  community_set_match_name VARCHAR(200),
  generated_script TEXT,
  rollback_script TEXT,
  affected_prefixes_json JSONB,
  risk_level VARCHAR(16) NOT NULL DEFAULT 'medium',
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  findings_json JSONB,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bgp_announcement_change_plans_device_id_idx
  ON bgp_announcement_change_plans(device_id);
CREATE INDEX IF NOT EXISTS bgp_announcement_change_plans_status_idx
  ON bgp_announcement_change_plans(status);
