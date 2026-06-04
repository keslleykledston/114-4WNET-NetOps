-- BGP Peer Cleanup Planner
-- Read-only analysis records for removal planning and markdown exports.

CREATE TABLE IF NOT EXISTS bgp_peer_cleanup_analyses (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  peer_ip TEXT NOT NULL,
  vrf TEXT,
  afi TEXT NOT NULL,
  safi TEXT NOT NULL,
  state TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  analysis_json JSONB NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  exported_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS bgp_peer_cleanup_analyses_device_peer_idx
  ON bgp_peer_cleanup_analyses(device_id, peer_ip);

CREATE INDEX IF NOT EXISTS bgp_peer_cleanup_analyses_created_at_idx
  ON bgp_peer_cleanup_analyses(created_at DESC);
