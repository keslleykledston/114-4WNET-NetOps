-- Change plan review workflow history (documental — no execution)

CREATE TABLE IF NOT EXISTS change_plan_review_events (
  id SERIAL PRIMARY KEY,
  change_plan_id INTEGER NOT NULL REFERENCES change_plans(id) ON DELETE CASCADE,
  actor TEXT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  previous_status TEXT NOT NULL,
  next_status TEXT NOT NULL,
  note TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS change_plan_review_events_plan_id_idx
  ON change_plan_review_events(change_plan_id, created_at DESC);
