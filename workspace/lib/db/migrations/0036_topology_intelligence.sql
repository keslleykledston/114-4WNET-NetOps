-- v0.9.4 Topology Intelligence tables

CREATE TABLE IF NOT EXISTS topology_nodes (
  id SERIAL PRIMARY KEY,
  node_type TEXT NOT NULL CHECK (node_type IN ('DEVICE', 'INTERFACE', 'BGP_PEER', 'L2_CIRCUIT', 'VSI', 'VRF', 'SERVICE', 'RESOURCE')),
  ref_id INTEGER,
  label TEXT NOT NULL,
  metadata_json JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(node_type, ref_id, label)
);

CREATE TABLE IF NOT EXISTS topology_edges (
  id SERIAL PRIMARY KEY,
  source_node_id INTEGER NOT NULL REFERENCES topology_nodes(id) ON DELETE CASCADE,
  target_node_id INTEGER NOT NULL REFERENCES topology_nodes(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL CHECK (edge_type IN ('HAS_INTERFACE', 'CONNECTED_TO', 'HAS_BGP_PEER', 'HAS_L2_CIRCUIT', 'HAS_VSI', 'USES_RESOURCE', 'BELONGS_TO_VRF', 'SERVICE_ON_DEVICE', 'SERVICE_USES_CIRCUIT')),
  confidence INTEGER DEFAULT 100 CHECK (confidence >= 0 AND confidence <= 100),
  metadata_json JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_node_id, target_node_id, edge_type)
);

CREATE TABLE IF NOT EXISTS topology_snapshots (
  id SERIAL PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id INTEGER,
  nodes_count INTEGER,
  edges_count INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_topology_nodes_type ON topology_nodes(node_type);
CREATE INDEX idx_topology_nodes_ref ON topology_nodes(ref_id);
CREATE INDEX idx_topology_edges_source ON topology_edges(source_node_id);
CREATE INDEX idx_topology_edges_target ON topology_edges(target_node_id);
CREATE INDEX idx_topology_edges_type ON topology_edges(edge_type);
CREATE INDEX idx_topology_snapshots_scope ON topology_snapshots(scope_type, scope_id);
