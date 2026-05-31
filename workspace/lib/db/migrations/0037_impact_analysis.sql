-- v0.9.5 Impact Analysis tables

CREATE TABLE IF NOT EXISTS impact_scenarios (
  id SERIAL PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('DEVICE', 'INTERFACE', 'L2_CIRCUIT', 'VSI', 'BGP_PEER', 'SERVICE', 'RESOURCE')),
  target_id INTEGER NOT NULL,
  target_label TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'WARNING' CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  summary TEXT,
  affected_count INTEGER DEFAULT 0,
  metadata_json JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS impact_affected_items (
  id SERIAL PRIMARY KEY,
  scenario_id INTEGER NOT NULL REFERENCES impact_scenarios(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  item_label TEXT NOT NULL,
  impact_type TEXT NOT NULL CHECK (impact_type IN ('DIRECT', 'INDIRECT', 'DEPENDENCY', 'RESOURCE_COLLISION', 'COMPLIANCE_RISK')),
  severity TEXT NOT NULL DEFAULT 'WARNING' CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO')),
  path_json JSONB DEFAULT '{}',
  metadata_json JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS impact_snapshots (
  id SERIAL PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id INTEGER,
  scenario_count INTEGER DEFAULT 0,
  affected_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_impact_scenarios_target ON impact_scenarios(target_type, target_id);
CREATE INDEX idx_impact_scenarios_status ON impact_scenarios(status);
CREATE INDEX idx_impact_scenarios_severity ON impact_scenarios(severity);
CREATE INDEX idx_impact_affected_scenario ON impact_affected_items(scenario_id);
CREATE INDEX idx_impact_affected_type ON impact_affected_items(item_type, item_id);
CREATE INDEX idx_impact_snapshots_scope ON impact_snapshots(scope_type, scope_id);
