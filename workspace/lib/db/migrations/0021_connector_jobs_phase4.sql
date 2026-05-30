-- Phase 4: device-linked connector jobs + masked audit payload

ALTER TABLE connector_jobs ADD COLUMN IF NOT EXISTS device_id integer REFERENCES devices(id) ON DELETE SET NULL;
ALTER TABLE connector_jobs ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE connector_jobs ADD COLUMN IF NOT EXISTS masked_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS connector_jobs_device_id_idx ON connector_jobs (device_id);
CREATE INDEX IF NOT EXISTS connector_jobs_correlation_id_idx ON connector_jobs (correlation_id);
