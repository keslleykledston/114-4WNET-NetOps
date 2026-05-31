CREATE TABLE IF NOT EXISTS config_diffs (
  id serial PRIMARY KEY,
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  previous_config_id integer REFERENCES collected_configs(id) ON DELETE SET NULL,
  current_config_id integer NOT NULL REFERENCES collected_configs(id) ON DELETE CASCADE,
  diff_summary text,
  diff_text text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS config_diffs_device_id_idx
  ON config_diffs(device_id);
CREATE UNIQUE INDEX IF NOT EXISTS config_diffs_current_config_id_uq
  ON config_diffs(current_config_id);
CREATE INDEX IF NOT EXISTS config_diffs_created_at_idx
  ON config_diffs(created_at);
