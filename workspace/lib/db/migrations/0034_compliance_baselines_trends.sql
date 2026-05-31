-- FASE v0.9.1 — Baselines + Trends
-- Baseline scopes: GLOBAL | SITE | VENDOR | DEVICE
-- Rules JSON: { "rulePattern": { enabled, severityOverride } }
-- Trends: daily snapshots of compliance scores per device/site/vendor

CREATE TABLE compliance_baselines (
  id SERIAL PRIMARY KEY,
  scope_type TEXT NOT NULL DEFAULT 'GLOBAL',
  scope_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  rules_json JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE compliance_trends (
  id SERIAL PRIMARY KEY,
  device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  site TEXT,
  vendor TEXT,
  scope TEXT NOT NULL DEFAULT 'device',
  score NUMERIC(5,2) NOT NULL DEFAULT 0,
  pass_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  total_devices INTEGER NOT NULL DEFAULT 1,
  snapshot_date TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX compliance_baselines_scope_idx ON compliance_baselines(scope_type, scope_id);
CREATE INDEX compliance_baselines_enabled_idx ON compliance_baselines(enabled);
CREATE INDEX compliance_trends_device_idx ON compliance_trends(device_id, snapshot_date DESC);
CREATE INDEX compliance_trends_site_idx ON compliance_trends(site, snapshot_date DESC);
CREATE INDEX compliance_trends_date_idx ON compliance_trends(snapshot_date DESC);
