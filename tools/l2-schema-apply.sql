-- Idempotent L2 circuit tables (MVP hotfix, non-interactive)
CREATE TABLE IF NOT EXISTS l2_circuits (
  id serial PRIMARY KEY,
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  circuit_type text NOT NULL,
  service_id text,
  name text NOT NULL,
  description text,
  outer_vlan integer,
  inner_vlan integer,
  vc_id text,
  vsi_name text,
  vsi_id text,
  local_interface text,
  parent_interface text,
  peer_ip text,
  admin_status text,
  oper_status text,
  pw_status text,
  mac_count integer,
  source text NOT NULL DEFAULT 'ssh_live',
  raw_evidence text,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_seen timestamp NOT NULL,
  last_seen timestamp NOT NULL,
  discovery_run_id text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS l2_circuits_device_id_idx ON l2_circuits (device_id);
CREATE INDEX IF NOT EXISTS l2_circuits_circuit_type_idx ON l2_circuits (circuit_type);
CREATE INDEX IF NOT EXISTS l2_circuits_vc_id_idx ON l2_circuits (vc_id);
CREATE INDEX IF NOT EXISTS l2_circuits_vsi_name_idx ON l2_circuits (vsi_name);
CREATE INDEX IF NOT EXISTS l2_circuits_discovery_run_id_idx ON l2_circuits (discovery_run_id);
CREATE INDEX IF NOT EXISTS l2_circuits_device_created_at_idx ON l2_circuits (device_id, created_at);
CREATE INDEX IF NOT EXISTS l2_circuits_peer_ip_idx ON l2_circuits (peer_ip);
CREATE INDEX IF NOT EXISTS l2_circuits_last_seen_idx ON l2_circuits (last_seen DESC);

CREATE TABLE IF NOT EXISTS l2_discovery_jobs (
  id serial PRIMARY KEY,
  run_id text NOT NULL UNIQUE,
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  status text NOT NULL,
  started_at timestamp NOT NULL,
  finished_at timestamp,
  circuit_count integer,
  findings_count integer,
  error_message text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS l2_discovery_jobs_run_id_idx ON l2_discovery_jobs (run_id);
CREATE INDEX IF NOT EXISTS l2_discovery_jobs_device_id_idx ON l2_discovery_jobs (device_id);
CREATE INDEX IF NOT EXISTS l2_discovery_jobs_status_idx ON l2_discovery_jobs (status);
CREATE INDEX IF NOT EXISTS l2_discovery_jobs_created_at_idx ON l2_discovery_jobs (created_at);
