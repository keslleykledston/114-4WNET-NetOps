CREATE TABLE IF NOT EXISTS bgp_announcement_rollbacks (
  id serial PRIMARY KEY,
  change_plan_id integer NOT NULL REFERENCES bgp_announcement_change_plans(id) ON DELETE CASCADE,
  execution_id integer REFERENCES bgp_announcement_executions(id) ON DELETE SET NULL,
  approval_id integer REFERENCES bgp_announcement_approvals(id) ON DELETE SET NULL,
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  base_snapshot_id integer NOT NULL,
  rollback_to_snapshot_id integer NOT NULL,
  current_snapshot_id integer,
  status text NOT NULL,
  mode text NOT NULL,
  requested_by integer,
  requested_at timestamp NOT NULL DEFAULT now(),
  approved_by integer,
  approved_at timestamp,
  started_at timestamp,
  finished_at timestamp,
  rollback_commands_json jsonb NOT NULL,
  rollback_diff_json jsonb NOT NULL,
  rollback_log_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  postcheck_id integer,
  error_message text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bgp_announcement_rollbacks_change_plan_idx
  ON bgp_announcement_rollbacks(change_plan_id);

CREATE INDEX IF NOT EXISTS bgp_announcement_rollbacks_device_status_idx
  ON bgp_announcement_rollbacks(device_id, status);
