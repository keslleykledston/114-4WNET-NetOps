-- H3.1 SNMP_FAST operational BGP peers (pilot)

CREATE TABLE IF NOT EXISTS operational_bgp_collection_jobs (
  id serial PRIMARY KEY,
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_code text,
  peer_count integer,
  freshness text NOT NULL DEFAULT 'unknown'
);

CREATE INDEX IF NOT EXISTS idx_operational_bgp_jobs_device_started
  ON operational_bgp_collection_jobs(device_id, started_at DESC);

CREATE TABLE IF NOT EXISTS operational_bgp_peers (
  id serial PRIMARY KEY,
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  collection_job_id integer REFERENCES operational_bgp_collection_jobs(id) ON DELETE SET NULL,
  peer_ip text NOT NULL,
  peer_as bigint,
  peer_type text NOT NULL DEFAULT 'unknown',
  vrf text,
  afi text NOT NULL DEFAULT 'ipv4',
  safi text NOT NULL DEFAULT 'unicast',
  admin_status text NOT NULL DEFAULT 'unknown',
  oper_status text NOT NULL DEFAULT 'unknown',
  fsm_state text NOT NULL DEFAULT 'unknown',
  uptime_seconds bigint,
  received_prefixes integer,
  accepted_prefixes integer,
  advertised_prefixes integer,
  last_change timestamptz,
  collected_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operational_bgp_peers_device_collected
  ON operational_bgp_peers(device_id, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_bgp_peers_device_peer
  ON operational_bgp_peers(device_id, peer_ip, vrf, afi, safi, collected_at DESC);
