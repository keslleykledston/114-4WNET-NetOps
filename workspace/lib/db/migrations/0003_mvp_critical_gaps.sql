CREATE TABLE IF NOT EXISTS audit_logs (
  id serial PRIMARY KEY,
  actor_id integer,
  action text NOT NULL,
  object_type text NOT NULL,
  object_id text NOT NULL,
  metadata_json jsonb,
  source_ip text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_action_idx
  ON audit_logs (action);

CREATE INDEX IF NOT EXISTS audit_logs_object_type_idx
  ON audit_logs (object_type);

CREATE INDEX IF NOT EXISTS audit_logs_object_id_idx
  ON audit_logs (object_id);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON audit_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id serial PRIMARY KEY,
  provisioning_job_id integer NOT NULL REFERENCES provisioning_jobs(id) ON DELETE CASCADE,
  report_type text NOT NULL DEFAULT 'markdown',
  content_markdown text NOT NULL,
  generated_by text,
  generated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_provisioning_job_id_idx
  ON reports (provisioning_job_id);

CREATE INDEX IF NOT EXISTS reports_generated_at_idx
  ON reports (generated_at DESC);

CREATE TABLE IF NOT EXISTS integration_settings (
  id serial PRIMARY KEY,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_settings_name_uq
  ON integration_settings (name);

CREATE INDEX IF NOT EXISTS integration_settings_enabled_idx
  ON integration_settings (enabled);

CREATE INDEX IF NOT EXISTS devices_hostname_idx
  ON devices (hostname);

CREATE INDEX IF NOT EXISTS devices_status_idx
  ON devices (status);

CREATE INDEX IF NOT EXISTS devices_vendor_idx
  ON devices (vendor);

CREATE INDEX IF NOT EXISTS devices_site_idx
  ON devices (site);

CREATE INDEX IF NOT EXISTS discovery_runs_device_created_idx
  ON discovery_runs (device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS discovery_runs_device_idx
  ON discovery_runs (device_id);

CREATE INDEX IF NOT EXISTS discovery_runs_created_at_idx
  ON discovery_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS discovery_snapshots_device_idx
  ON discovery_snapshots (device_id);

CREATE INDEX IF NOT EXISTS discovery_snapshots_run_idx
  ON discovery_snapshots (discovery_run_id);

CREATE INDEX IF NOT EXISTS discovery_snapshots_hash_idx
  ON discovery_snapshots (snapshot_hash);

CREATE INDEX IF NOT EXISTS discovery_snapshots_created_at_idx
  ON discovery_snapshots (created_at DESC);

CREATE INDEX IF NOT EXISTS discovery_evidence_device_idx
  ON discovery_evidence (device_id);

CREATE INDEX IF NOT EXISTS discovery_evidence_run_idx
  ON discovery_evidence (discovery_run_id);

CREATE INDEX IF NOT EXISTS discovery_evidence_source_idx
  ON discovery_evidence (source);

CREATE INDEX IF NOT EXISTS discovery_evidence_context_idx
  ON discovery_evidence (context);

CREATE INDEX IF NOT EXISTS bgp_route_history_device_peer_time_idx
  ON bgp_route_history (device_id, peer_ip, query_time DESC);

CREATE INDEX IF NOT EXISTS bgp_route_history_device_peer_direction_time_idx
  ON bgp_route_history (device_id, peer_ip, direction, created_at DESC);

CREATE INDEX IF NOT EXISTS bgp_route_history_device_time_idx
  ON bgp_route_history (device_id, query_time DESC);
