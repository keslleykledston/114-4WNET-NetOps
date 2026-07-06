-- BGP Announcement Matrix PR5: read-only preview and change-plan drafts.

CREATE TABLE IF NOT EXISTS bgp_announcement_change_plans (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  base_snapshot_id INTEGER NOT NULL,
  collection_id INTEGER,
  preview_id TEXT NOT NULL,
  target_policy_name TEXT NOT NULL,
  target_type TEXT NOT NULL,
  node INTEGER,
  upstream_circuit_id TEXT NOT NULL,
  upstream_name TEXT NOT NULL,
  current_state TEXT NOT NULL,
  desired_state TEXT NOT NULL,
  current_community TEXT,
  desired_community TEXT,
  diff_json JSONB NOT NULL,
  proposed_commands_json JSONB NOT NULL,
  rollback_commands_json JSONB NOT NULL,
  findings_json JSONB NOT NULL,
  risk_level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  note TEXT,
  preview_json JSONB NOT NULL,
  created_by INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bgp_announcement_change_plans_device_status_idx
  ON bgp_announcement_change_plans(device_id, status);

CREATE INDEX IF NOT EXISTS bgp_announcement_change_plans_device_created_at_idx
  ON bgp_announcement_change_plans(device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bgp_announcement_change_plans_preview_idx
  ON bgp_announcement_change_plans(preview_id);
