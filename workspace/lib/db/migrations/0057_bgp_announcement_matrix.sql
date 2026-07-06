-- BGP Announcement Matrix foundation: persisted snapshots, runs, diffs and events.

CREATE TABLE IF NOT EXISTS bgp_announcement_matrix_snapshots (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  tenant_id INTEGER,
  collection_id INTEGER,
  snapshot_version INTEGER NOT NULL DEFAULT 1,
  snapshot_hash TEXT NOT NULL,
  is_latest BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  family_scope TEXT NOT NULL DEFAULT 'all',
  total_targets INTEGER NOT NULL DEFAULT 0,
  total_upstreams INTEGER NOT NULL DEFAULT 0,
  total_cells INTEGER NOT NULL DEFAULT 0,
  total_findings INTEGER NOT NULL DEFAULT 0,
  total_critical_findings INTEGER NOT NULL DEFAULT 0,
  matrix_json JSONB NOT NULL,
  summary_json JSONB NOT NULL,
  filters_json JSONB NOT NULL,
  generated_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by INTEGER
);

CREATE INDEX IF NOT EXISTS bgp_announcement_matrix_snapshots_device_latest_idx
  ON bgp_announcement_matrix_snapshots(device_id, is_latest);

CREATE INDEX IF NOT EXISTS bgp_announcement_matrix_snapshots_device_generated_at_idx
  ON bgp_announcement_matrix_snapshots(device_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS bgp_announcement_matrix_snapshots_hash_idx
  ON bgp_announcement_matrix_snapshots(snapshot_hash);

CREATE TABLE IF NOT EXISTS bgp_announcement_matrix_runs (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  requested_by INTEGER,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP,
  collection_id INTEGER,
  previous_snapshot_id INTEGER,
  new_snapshot_id INTEGER,
  error_message TEXT,
  logs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bgp_announcement_matrix_runs_device_id_idx
  ON bgp_announcement_matrix_runs(device_id);

CREATE INDEX IF NOT EXISTS bgp_announcement_matrix_runs_created_at_idx
  ON bgp_announcement_matrix_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS bgp_announcement_matrix_diffs (
  id SERIAL PRIMARY KEY,
  previous_snapshot_id INTEGER NOT NULL,
  current_snapshot_id INTEGER NOT NULL,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  diff_hash TEXT NOT NULL,
  added_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  removed_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  changed_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bgp_announcement_matrix_diffs_device_id_idx
  ON bgp_announcement_matrix_diffs(device_id);

CREATE INDEX IF NOT EXISTS bgp_announcement_matrix_diffs_current_snapshot_id_idx
  ON bgp_announcement_matrix_diffs(current_snapshot_id);

CREATE TABLE IF NOT EXISTS bgp_announcement_history_events (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  target_policy_name TEXT NOT NULL,
  family TEXT NOT NULL,
  prefix TEXT,
  upstream_circuit_id TEXT,
  upstream_name TEXT,
  event_type TEXT NOT NULL,
  old_state TEXT,
  new_state TEXT,
  old_community TEXT,
  new_community TEXT,
  snapshot_id INTEGER NOT NULL,
  detected_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bgp_announcement_history_events_device_id_idx
  ON bgp_announcement_history_events(device_id);

CREATE INDEX IF NOT EXISTS bgp_announcement_history_events_snapshot_id_idx
  ON bgp_announcement_history_events(snapshot_id);
