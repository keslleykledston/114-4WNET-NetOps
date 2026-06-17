-- BGP Peer Collection History
-- Persist previous/current peer versions and the peers that disappeared on each SNMP collection.

CREATE TABLE IF NOT EXISTS bgp_peer_collection_history (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  previous_snapshot_id INTEGER REFERENCES snmp_snapshots(id) ON DELETE SET NULL,
  current_snapshot_id INTEGER REFERENCES snmp_snapshots(id) ON DELETE SET NULL,
  collector TEXT NOT NULL DEFAULT 'snmp',
  previous_peers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_peers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  removed_peers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  removed_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS bgp_peer_collection_history_device_created_at_idx
  ON bgp_peer_collection_history(device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bgp_peer_collection_history_current_snapshot_idx
  ON bgp_peer_collection_history(current_snapshot_id);
