ALTER TABLE integration_settings
  ADD COLUMN IF NOT EXISTS readiness text NOT NULL DEFAULT 'future',
  ADD COLUMN IF NOT EXISTS last_connection_status text,
  ADD COLUMN IF NOT EXISTS last_connection_at timestamp;

UPDATE integration_settings
SET readiness = COALESCE(readiness, 'future')
WHERE readiness IS NULL;
