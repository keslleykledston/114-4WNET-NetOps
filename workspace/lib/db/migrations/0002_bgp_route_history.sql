CREATE TABLE IF NOT EXISTS bgp_route_history (
  id serial PRIMARY KEY,
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  peer_ip text NOT NULL,
  direction text NOT NULL,
  query_time timestamp NOT NULL,
  total_routes integer NOT NULL,
  routes_returned integer NOT NULL,
  routes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL,
  status text NOT NULL,
  error_message text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bgp_route_history_device_peer_time_idx
  ON bgp_route_history (device_id, peer_ip, query_time DESC);

CREATE INDEX IF NOT EXISTS bgp_route_history_device_time_idx
  ON bgp_route_history (device_id, query_time DESC);
