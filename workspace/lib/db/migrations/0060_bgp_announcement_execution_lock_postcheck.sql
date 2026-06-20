CREATE TABLE IF NOT EXISTS bgp_announcement_execution_locks (
  id serial PRIMARY KEY,
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  target_policy_name text NOT NULL,
  node integer,
  upstream_circuit_id text NOT NULL,
  change_plan_id integer NOT NULL REFERENCES bgp_announcement_change_plans(id) ON DELETE CASCADE,
  execution_id integer REFERENCES bgp_announcement_executions(id) ON DELETE SET NULL,
  status text NOT NULL,
  locked_by integer,
  locked_at timestamp NOT NULL,
  expires_at timestamp NOT NULL,
  released_at timestamp,
  release_reason text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bgp_announcement_execution_locks_device_target_idx
  ON bgp_announcement_execution_locks(device_id, target_policy_name, node, upstream_circuit_id);

CREATE INDEX IF NOT EXISTS bgp_announcement_execution_locks_device_status_idx
  ON bgp_announcement_execution_locks(device_id, status);

CREATE TABLE IF NOT EXISTS bgp_announcement_postchecks (
  id serial PRIMARY KEY,
  change_plan_id integer NOT NULL REFERENCES bgp_announcement_change_plans(id) ON DELETE CASCADE,
  execution_id integer REFERENCES bgp_announcement_executions(id) ON DELETE SET NULL,
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  expected_snapshot_id integer,
  observed_snapshot_id integer,
  expected_state text NOT NULL,
  observed_state text NOT NULL,
  expected_community text,
  observed_community text,
  status text NOT NULL,
  diff_json jsonb NOT NULL,
  findings_json jsonb NOT NULL,
  started_at timestamp NOT NULL,
  finished_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bgp_announcement_postchecks_change_plan_idx
  ON bgp_announcement_postchecks(change_plan_id);

CREATE INDEX IF NOT EXISTS bgp_announcement_postchecks_device_status_idx
  ON bgp_announcement_postchecks(device_id, status);
