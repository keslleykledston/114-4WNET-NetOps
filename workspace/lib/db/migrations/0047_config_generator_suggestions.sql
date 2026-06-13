ALTER TABLE config_generator_runs
  ADD COLUMN IF NOT EXISTS field_origins_json jsonb NOT NULL DEFAULT '{}'::jsonb;
