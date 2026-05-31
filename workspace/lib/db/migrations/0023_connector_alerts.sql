-- Phase 5: connector operational alerts

CREATE TABLE IF NOT EXISTS connector_alerts (
  id serial PRIMARY KEY,
  connector_id integer NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id integer REFERENCES devices(id) ON DELETE SET NULL,
  severity text NOT NULL,
  alert_type text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  title text NOT NULL,
  message text NOT NULL,
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connector_alerts_connector_status_idx
  ON connector_alerts (connector_id, status);

CREATE INDEX IF NOT EXISTS connector_alerts_tenant_status_idx
  ON connector_alerts (tenant_id, status);

CREATE INDEX IF NOT EXISTS connector_alerts_device_idx
  ON connector_alerts (device_id);

CREATE INDEX IF NOT EXISTS connector_alerts_type_open_idx
  ON connector_alerts (connector_id, alert_type, device_id)
  WHERE status IN ('OPEN', 'ACKNOWLEDGED');
