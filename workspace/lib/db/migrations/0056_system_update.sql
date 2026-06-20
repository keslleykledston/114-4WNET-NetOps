-- System update module: version history, checks, runs, steps, backups.

CREATE TABLE IF NOT EXISTS system_versions (
  id SERIAL PRIMARY KEY,
  version TEXT NOT NULL,
  git_commit TEXT NOT NULL,
  git_branch TEXT NOT NULL,
  git_tag TEXT,
  build_id TEXT,
  installed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  installed_by TEXT,
  source TEXT NOT NULL DEFAULT 'local_git',
  status TEXT NOT NULL DEFAULT 'installed',
  metadata_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS system_versions_git_commit_idx ON system_versions(git_commit);
CREATE INDEX IF NOT EXISTS system_versions_installed_at_idx ON system_versions(installed_at);

CREATE TABLE IF NOT EXISTS system_update_checks (
  id SERIAL PRIMARY KEY,
  checked_by TEXT,
  current_version TEXT NOT NULL,
  current_commit TEXT NOT NULL,
  remote_version TEXT NOT NULL,
  remote_commit TEXT NOT NULL,
  update_available BOOLEAN NOT NULL DEFAULT FALSE,
  channel TEXT NOT NULL DEFAULT 'stable',
  changelog TEXT,
  risk_level TEXT NOT NULL DEFAULT 'low',
  metadata_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS system_update_checks_created_at_idx ON system_update_checks(created_at DESC);
CREATE INDEX IF NOT EXISTS system_update_checks_remote_commit_idx ON system_update_checks(remote_commit);
CREATE INDEX IF NOT EXISTS system_update_checks_update_available_idx ON system_update_checks(update_available);

CREATE TABLE IF NOT EXISTS system_update_runs (
  id SERIAL PRIMARY KEY,
  requested_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  from_version TEXT NOT NULL,
  from_commit TEXT NOT NULL,
  to_version TEXT NOT NULL,
  to_commit TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'stable',
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  failed_at TIMESTAMP,
  failure_stage TEXT,
  failure_reason TEXT,
  rollback_started_at TIMESTAMP,
  rollback_finished_at TIMESTAMP,
  rollback_status TEXT,
  backup_id INTEGER,
  metadata_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS system_update_runs_created_at_idx ON system_update_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS system_update_runs_status_idx ON system_update_runs(status);
CREATE INDEX IF NOT EXISTS system_update_runs_to_commit_idx ON system_update_runs(to_commit);

CREATE TABLE IF NOT EXISTS system_update_steps (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES system_update_runs(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  duration_ms INTEGER,
  sanitized_output TEXT,
  error_message TEXT,
  metadata_json JSONB
);

CREATE INDEX IF NOT EXISTS system_update_steps_run_id_idx ON system_update_steps(run_id);
CREATE INDEX IF NOT EXISTS system_update_steps_step_order_idx ON system_update_steps(run_id, step_order);

CREATE TABLE IF NOT EXISTS system_update_backups (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES system_update_runs(id) ON DELETE CASCADE,
  backup_type TEXT NOT NULL,
  path TEXT NOT NULL,
  checksum TEXT,
  size_bytes INTEGER,
  status TEXT NOT NULL DEFAULT 'created',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata_json JSONB
);

CREATE INDEX IF NOT EXISTS system_update_backups_run_id_idx ON system_update_backups(run_id);
CREATE INDEX IF NOT EXISTS system_update_backups_created_at_idx ON system_update_backups(created_at DESC);
