CREATE TABLE IF NOT EXISTS bgp_announcement_approvals (
  id serial PRIMARY KEY,
  change_plan_id integer NOT NULL REFERENCES bgp_announcement_change_plans(id) ON DELETE CASCADE,
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  base_snapshot_id integer NOT NULL,
  requested_by integer,
  requested_at timestamp NOT NULL DEFAULT now(),
  reviewed_by integer,
  reviewed_at timestamp,
  status text NOT NULL DEFAULT 'pending',
  reason text,
  risk_level text NOT NULL,
  findings_json jsonb NOT NULL,
  diff_json jsonb NOT NULL,
  proposed_commands_json jsonb NOT NULL,
  rollback_commands_json jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bgp_announcement_approvals_change_plan_idx
  ON bgp_announcement_approvals(change_plan_id);

CREATE INDEX IF NOT EXISTS bgp_announcement_approvals_device_status_idx
  ON bgp_announcement_approvals(device_id, status);

CREATE TABLE IF NOT EXISTS bgp_announcement_executions (
  id serial PRIMARY KEY,
  change_plan_id integer NOT NULL REFERENCES bgp_announcement_change_plans(id) ON DELETE CASCADE,
  approval_id integer REFERENCES bgp_announcement_approvals(id) ON DELETE SET NULL,
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  mode text NOT NULL,
  status text NOT NULL,
  started_by integer,
  started_at timestamp NOT NULL,
  finished_at timestamp,
  base_snapshot_id integer NOT NULL,
  collection_id integer,
  proposed_commands_json jsonb NOT NULL,
  rollback_commands_json jsonb NOT NULL,
  execution_log_json jsonb NOT NULL,
  result_json jsonb NOT NULL,
  error_message text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bgp_announcement_executions_change_plan_idx
  ON bgp_announcement_executions(change_plan_id);

CREATE INDEX IF NOT EXISTS bgp_announcement_executions_device_status_idx
  ON bgp_announcement_executions(device_id, status);

ALTER TABLE bgp_announcement_change_plans
  ADD COLUMN IF NOT EXISTS postcheck_required boolean NOT NULL DEFAULT true;

ALTER TABLE bgp_announcement_change_plans
  ADD COLUMN IF NOT EXISTS postcheck_status text NOT NULL DEFAULT 'pending';
