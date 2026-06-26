-- Manual network map layouts (devices, links, positions).

CREATE TABLE IF NOT EXISTS topology_layouts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'global',
  scope_id INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT false,
  payload_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS topology_layouts_name_scope_idx
  ON topology_layouts (name, scope_type, COALESCE(scope_id, -1));

CREATE INDEX IF NOT EXISTS topology_layouts_active_idx
  ON topology_layouts (scope_type, scope_id, is_active);
