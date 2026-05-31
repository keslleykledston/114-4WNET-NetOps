-- FASE v0.7.0: Provisioning Execute Controlado
-- Adiciona campos de approval, execution plan, postcheck, e maintenance window

ALTER TABLE provisioning_jobs
  ADD COLUMN approved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN approved_at TIMESTAMP,
  ADD COLUMN execution_plan_json TEXT,
  ADD COLUMN rollback_plan_generated TEXT,
  ADD COLUMN postcheck_at TIMESTAMP,
  ADD COLUMN postcheck_result TEXT,
  ADD COLUMN postcheck_output TEXT,
  ADD COLUMN maintenance_window_start TIMESTAMP,
  ADD COLUMN maintenance_window_end TIMESTAMP;

ALTER TABLE provisioning_steps
  ADD COLUMN stdout TEXT,
  ADD COLUMN stderr TEXT,
  ADD COLUMN command_sent TEXT,
  ADD COLUMN command_locked BOOLEAN DEFAULT FALSE;

CREATE INDEX provisioning_jobs_approved_by_user_id_idx
  ON provisioning_jobs(approved_by_user_id);
CREATE INDEX provisioning_jobs_postcheck_result_idx
  ON provisioning_jobs(postcheck_result);
