-- D5 BGP peer drilldown cache and history

CREATE TABLE IF NOT EXISTS bgp_peer_drilldown_snapshots (
  id serial PRIMARY KEY,
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  peer text NOT NULL,
  source text NOT NULL,
  config_build_source text NOT NULL,
  peer_hash text NOT NULL,
  collected_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  snapshot_json jsonb NOT NULL,
  runtime_json jsonb,
  warnings jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bgp_peer_drilldown_snapshots_device_peer_created_idx
  ON bgp_peer_drilldown_snapshots(device_id, peer, created_at DESC);

CREATE INDEX IF NOT EXISTS bgp_peer_drilldown_snapshots_device_peer_expires_idx
  ON bgp_peer_drilldown_snapshots(device_id, peer, expires_at DESC);

CREATE INDEX IF NOT EXISTS bgp_peer_drilldown_snapshots_source_idx
  ON bgp_peer_drilldown_snapshots(source);

CREATE INDEX IF NOT EXISTS bgp_peer_drilldown_snapshots_peer_hash_idx
  ON bgp_peer_drilldown_snapshots(peer_hash);
