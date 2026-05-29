CREATE TABLE IF NOT EXISTS l2_device_operational (
  device_id integer PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  last_refresh_at timestamp,
  freshness text NOT NULL DEFAULT 'unknown',
  operational_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS l2_device_operational_freshness_idx ON l2_device_operational (freshness);
