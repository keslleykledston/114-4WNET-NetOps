-- FASE v0.9.0 — Compliance Driven Operations
-- Drift detection table + indexes

CREATE TABLE compliance_drifts (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  service_request_id INTEGER REFERENCES service_requests(id) ON DELETE SET NULL,
  expected_state_json JSONB NOT NULL DEFAULT '{}',
  actual_state_json JSONB NOT NULL DEFAULT '{}',
  drift_summary TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX compliance_drifts_device_idx ON compliance_drifts(device_id);
CREATE INDEX compliance_drifts_created_idx ON compliance_drifts(created_at DESC);
