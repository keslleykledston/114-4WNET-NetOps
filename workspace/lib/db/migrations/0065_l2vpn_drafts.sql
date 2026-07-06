CREATE TABLE IF NOT EXISTS l2vpn_drafts (
  id serial PRIMARY KEY,
  title text NOT NULL,
  notes text,
  circuit_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  edits jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_by_user_id integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS l2vpn_drafts_status_idx
  ON l2vpn_drafts (status);

CREATE INDEX IF NOT EXISTS l2vpn_drafts_created_at_idx
  ON l2vpn_drafts (created_at DESC);
