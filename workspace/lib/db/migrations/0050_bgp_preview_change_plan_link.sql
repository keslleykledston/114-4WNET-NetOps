-- Link BGP announcement change previews to generic change_plans (draft only).

ALTER TABLE bgp_announcement_change_previews
  ADD COLUMN IF NOT EXISTS change_plan_id INTEGER REFERENCES change_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bgp_announcement_change_previews_change_plan_id_idx
  ON bgp_announcement_change_previews(change_plan_id);
