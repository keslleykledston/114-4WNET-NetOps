-- L2 circuits schema hotfix — idempotent, preserves existing rows.
-- Aligns live PostgreSQL with workspace/lib/db/src/schema/l2circuits.ts
-- Safe to re-run: ADD COLUMN IF NOT EXISTS only.

BEGIN;

ALTER TABLE l2_circuits
  ADD COLUMN IF NOT EXISTS classification text;

ALTER TABLE l2_circuits
  ADD COLUMN IF NOT EXISTS l2_transport text;

ALTER TABLE l2_circuits
  ADD COLUMN IF NOT EXISTS device_role_family text;

ALTER TABLE l2_circuits
  ADD COLUMN IF NOT EXISTS evidence_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE l2_circuits
  ADD COLUMN IF NOT EXISTS anomaly_tags jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE l2_circuits
  ADD COLUMN IF NOT EXISTS role_context text;

-- raw_evidence + findings may already exist on older deployments; keep types aligned.
ALTER TABLE l2_circuits
  ADD COLUMN IF NOT EXISTS raw_evidence text;

ALTER TABLE l2_circuits
  ADD COLUMN IF NOT EXISTS findings jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
