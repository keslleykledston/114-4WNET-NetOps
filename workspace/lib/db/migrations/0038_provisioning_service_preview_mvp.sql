-- Provisioning Service Preview MVP
-- Adds structured L2VPN/L3VPN preview fields to existing provisioning_jobs without breaking the legacy flow.

ALTER TABLE provisioning_jobs
  ADD COLUMN IF NOT EXISTS service_type TEXT,
  ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS target_devices_json TEXT,
  ADD COLUMN IF NOT EXISTS parameters_json TEXT,
  ADD COLUMN IF NOT EXISTS validation_result_json TEXT,
  ADD COLUMN IF NOT EXISTS rendered_config_json TEXT,
  ADD COLUMN IF NOT EXISTS rendered_rollback_json TEXT,
  ADD COLUMN IF NOT EXISTS rendered_validation_json TEXT,
  ADD COLUMN IF NOT EXISTS risk_summary_json TEXT,
  ADD COLUMN IF NOT EXISTS approval_status TEXT,
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_parameters_json TEXT,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

UPDATE provisioning_jobs
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

ALTER TABLE provisioning_jobs
  ALTER COLUMN updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS provisioning_jobs_service_type_idx
  ON provisioning_jobs(service_type);

CREATE INDEX IF NOT EXISTS provisioning_jobs_approval_status_idx
  ON provisioning_jobs(approval_status);

CREATE INDEX IF NOT EXISTS provisioning_jobs_tenant_id_idx
  ON provisioning_jobs(tenant_id);
