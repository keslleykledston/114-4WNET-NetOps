-- v0.2.7: BGP Route Query Logging and Persistence
-- Enhance bgp_route_history with query execution context and duration metrics

-- Verify table exists and add columns if missing
ALTER TABLE IF EXISTS bgp_route_history
ADD COLUMN IF NOT EXISTS query_duration_ms integer,
ADD COLUMN IF NOT EXISTS query_executed_at timestamp default current_timestamp;

-- Create index on queries for analytics
CREATE INDEX IF NOT EXISTS idx_bgp_route_history_device_peer_direction
ON bgp_route_history (device_id, peer_ip, direction);

CREATE INDEX IF NOT EXISTS idx_bgp_route_history_timestamp
ON bgp_route_history (query_executed_at DESC);

-- Log entry: v0.2.7 migration applied
-- Allows queries to track:
-- - query_duration_ms: SSH round-trip time
-- - query_executed_at: When the query was executed
-- - Enables analytics on route discovery performance
-- - Supports trend analysis and capacity planning
