-- Idempotent hotfix: classification columns missing on some live DBs (0014 not applied).
ALTER TABLE l2_circuits ADD COLUMN IF NOT EXISTS classification text;
ALTER TABLE l2_circuits ADD COLUMN IF NOT EXISTS l2_transport text;
ALTER TABLE l2_circuits ADD COLUMN IF NOT EXISTS device_role_family text;
ALTER TABLE l2_circuits ADD COLUMN IF NOT EXISTS evidence_flags jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE l2_circuits ADD COLUMN IF NOT EXISTS anomaly_tags jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE l2_circuits ADD COLUMN IF NOT EXISTS role_context text;
ALTER TABLE l2_circuits ADD COLUMN IF NOT EXISTS raw_evidence text;
ALTER TABLE l2_circuits ADD COLUMN IF NOT EXISTS findings jsonb NOT NULL DEFAULT '[]'::jsonb;
