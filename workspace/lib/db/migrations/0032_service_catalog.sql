-- Service Catalog v0.8.3
-- NOC-friendly service abstraction over templates

CREATE TABLE service_catalog (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  vendor TEXT NOT NULL DEFAULT 'any',
  service_type TEXT NOT NULL,
  template_id TEXT,
  form_schema_json TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  icon TEXT,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE service_requests (
  id SERIAL PRIMARY KEY,
  service_catalog_id INTEGER NOT NULL REFERENCES service_catalog(id),
  device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  connector_group_id INTEGER REFERENCES connector_groups(id) ON DELETE SET NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  provisioning_job_id INTEGER,
  preview_data_json TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE service_request_audit_logs (
  id SERIAL PRIMARY KEY,
  service_request_id INTEGER NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  actor TEXT,
  action TEXT NOT NULL,
  metadata_json TEXT,
  ip_address TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX service_catalog_status_idx ON service_catalog(status);
CREATE INDEX service_requests_status_idx ON service_requests(status);
CREATE INDEX service_requests_created_by_idx ON service_requests(created_by);
