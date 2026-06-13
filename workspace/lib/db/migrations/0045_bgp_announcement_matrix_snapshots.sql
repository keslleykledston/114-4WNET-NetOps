-- Timelapse: persist compact BGP announcement matrix snapshots per device

CREATE TABLE IF NOT EXISTS bgp_announcement_matrix_snapshots (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  rows_json JSONB NOT NULL,
  upstreams_json JSONB DEFAULT '[]'::jsonb,
  meta_json JSONB DEFAULT '{}'::jsonb,
  row_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bgp_announcement_matrix_snapshots_device_created_idx
  ON bgp_announcement_matrix_snapshots(device_id, created_at DESC);
