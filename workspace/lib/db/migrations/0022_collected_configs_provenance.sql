ALTER TABLE collected_configs ADD COLUMN IF NOT EXISTS connector_id integer REFERENCES connectors(id) ON DELETE SET NULL;
ALTER TABLE collected_configs ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE collected_configs ADD COLUMN IF NOT EXISTS connector_job_id integer;
ALTER TABLE collected_configs ADD COLUMN IF NOT EXISTS parser_status text;
ALTER TABLE collected_configs ADD COLUMN IF NOT EXISTS parser_error text;
ALTER TABLE collected_configs ADD COLUMN IF NOT EXISTS parsed_summary_json jsonb;

CREATE INDEX IF NOT EXISTS collected_configs_device_collected_idx
  ON collected_configs (device_id, collected_at DESC);
