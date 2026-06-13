-- Config Generator MVP

CREATE TABLE IF NOT EXISTS config_generator_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  vendor TEXT NOT NULL,
  platform TEXT NOT NULL,
  template_key TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS config_generator_templates_service_type_idx
  ON config_generator_templates(service_type);

CREATE INDEX IF NOT EXISTS config_generator_templates_vendor_platform_idx
  ON config_generator_templates(vendor, platform);

CREATE INDEX IF NOT EXISTS config_generator_templates_is_active_idx
  ON config_generator_templates(is_active);

CREATE TABLE IF NOT EXISTS config_generator_template_versions (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES config_generator_templates(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  content TEXT NOT NULL,
  schema_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  renderer TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT config_generator_template_versions_template_version_uq UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS config_generator_template_versions_template_id_idx
  ON config_generator_template_versions(template_id);

CREATE INDEX IF NOT EXISTS config_generator_template_versions_checksum_idx
  ON config_generator_template_versions(checksum);

CREATE INDEX IF NOT EXISTS config_generator_template_versions_created_by_idx
  ON config_generator_template_versions(created_by);

CREATE TABLE IF NOT EXISTS config_generator_runs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  template_version_id INTEGER NOT NULL REFERENCES config_generator_template_versions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL,
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  rendered_config TEXT NOT NULL DEFAULT '',
  validation_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_level TEXT NOT NULL DEFAULT 'low',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS config_generator_runs_tenant_id_idx
  ON config_generator_runs(tenant_id);

CREATE INDEX IF NOT EXISTS config_generator_runs_device_id_idx
  ON config_generator_runs(device_id);

CREATE INDEX IF NOT EXISTS config_generator_runs_template_version_id_idx
  ON config_generator_runs(template_version_id);

CREATE INDEX IF NOT EXISTS config_generator_runs_created_at_idx
  ON config_generator_runs(created_at);

CREATE INDEX IF NOT EXISTS config_generator_runs_tenant_device_created_idx
  ON config_generator_runs(tenant_id, device_id, created_at);

CREATE INDEX IF NOT EXISTS config_generator_runs_created_by_idx
  ON config_generator_runs(created_by);

CREATE TABLE IF NOT EXISTS config_generator_validations (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES config_generator_runs(id) ON DELETE CASCADE,
  severity TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS config_generator_validations_run_id_idx
  ON config_generator_validations(run_id);

CREATE INDEX IF NOT EXISTS config_generator_validations_severity_idx
  ON config_generator_validations(severity);

CREATE TABLE IF NOT EXISTS config_generator_artifacts (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES config_generator_runs(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL,
  content TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS config_generator_artifacts_run_id_idx
  ON config_generator_artifacts(run_id);

CREATE INDEX IF NOT EXISTS config_generator_artifacts_artifact_type_idx
  ON config_generator_artifacts(artifact_type);

CREATE INDEX IF NOT EXISTS config_generator_artifacts_checksum_idx
  ON config_generator_artifacts(checksum);

CREATE TABLE IF NOT EXISTS config_generator_change_requests (
  id SERIAL PRIMARY KEY,
  generation_run_id INTEGER NOT NULL REFERENCES config_generator_runs(id) ON DELETE CASCADE,
  approval_status TEXT NOT NULL DEFAULT 'draft',
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  execution_status TEXT NOT NULL DEFAULT 'blocked',
  execution_plan_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  rollback_plan_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT config_generator_change_requests_generation_run_id_uq UNIQUE (generation_run_id)
);

CREATE INDEX IF NOT EXISTS config_generator_change_requests_approval_status_idx
  ON config_generator_change_requests(approval_status);

CREATE INDEX IF NOT EXISTS config_generator_change_requests_execution_status_idx
  ON config_generator_change_requests(execution_status);

CREATE INDEX IF NOT EXISTS config_generator_change_requests_approved_by_idx
  ON config_generator_change_requests(approved_by);
