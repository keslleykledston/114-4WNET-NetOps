-- Append-only read-only change previews for BGP Announcement Matrix (Cliente/ORIGIN).

CREATE TABLE IF NOT EXISTS bgp_announcement_change_previews (
  id serial PRIMARY KEY,
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  snapshot_id integer REFERENCES bgp_announcement_matrix_snapshots(id) ON DELETE SET NULL,
  target_id varchar(256) NOT NULL,
  preview_json jsonb NOT NULL,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bgp_announcement_change_previews_device_created_idx
  ON bgp_announcement_change_previews(device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bgp_announcement_change_previews_snapshot_target_idx
  ON bgp_announcement_change_previews(snapshot_id, target_id);
