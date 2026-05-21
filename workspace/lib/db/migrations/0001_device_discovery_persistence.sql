CREATE TABLE IF NOT EXISTS discovery_runs (
  id serial PRIMARY KEY,
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  requested_contexts_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  prefer_live_ssh boolean NOT NULL DEFAULT true,
  allow_snmp_fallback boolean NOT NULL DEFAULT true,
  use_cached_config boolean NOT NULL DEFAULT true,
  status text NOT NULL,
  ssh_status text,
  ssh_message text,
  snmp_status text,
  snmp_message text,
  cached_config_used boolean NOT NULL DEFAULT false,
  source_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamp NOT NULL,
  finished_at timestamp,
  created_by text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS discovery_runs_device_created_idx
  ON discovery_runs (device_id, created_at DESC);

CREATE TABLE IF NOT EXISTS discovery_snapshots (
  id serial PRIMARY KEY,
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  discovery_run_id integer NOT NULL REFERENCES discovery_runs(id) ON DELETE CASCADE,
  status text NOT NULL,
  snapshot_json jsonb NOT NULL,
  source_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  parser_version text NOT NULL,
  snapshot_hash text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS discovery_snapshots_device_created_idx
  ON discovery_snapshots (device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS discovery_snapshots_device_hash_idx
  ON discovery_snapshots (device_id, snapshot_hash);

CREATE TABLE IF NOT EXISTS discovery_evidence (
  id serial PRIMARY KEY,
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  discovery_run_id integer NOT NULL REFERENCES discovery_runs(id) ON DELETE CASCADE,
  context text NOT NULL,
  source text NOT NULL,
  command_or_oid_group text,
  sanitized_output text NOT NULL,
  status text NOT NULL,
  error_message text,
  started_at timestamp NOT NULL,
  finished_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS discovery_evidence_run_idx
  ON discovery_evidence (discovery_run_id);

CREATE INDEX IF NOT EXISTS discovery_evidence_device_created_idx
  ON discovery_evidence (device_id, created_at DESC);
