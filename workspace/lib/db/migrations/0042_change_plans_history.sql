-- Generic change plan history, snapshots, items, diffs and documental rollback.

CREATE TABLE IF NOT EXISTS change_plans (
  id SERIAL PRIMARY KEY,
  module TEXT NOT NULL,
  change_type TEXT NOT NULL,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  created_by TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  ticket_ref TEXT,
  source_object_type TEXT,
  source_object_id TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS change_plans_device_id_idx ON change_plans(device_id);
CREATE INDEX IF NOT EXISTS change_plans_module_idx ON change_plans(module);
CREATE INDEX IF NOT EXISTS change_plans_status_idx ON change_plans(status);
CREATE INDEX IF NOT EXISTS change_plans_created_at_idx ON change_plans(created_at DESC);
CREATE INDEX IF NOT EXISTS change_plans_source_object_idx ON change_plans(source_object_type, source_object_id);

CREATE TABLE IF NOT EXISTS change_plan_snapshots (
  id SERIAL PRIMARY KEY,
  change_plan_id INTEGER NOT NULL REFERENCES change_plans(id) ON DELETE CASCADE,
  snapshot_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS change_plan_snapshots_change_plan_id_idx
  ON change_plan_snapshots(change_plan_id);

CREATE TABLE IF NOT EXISTS change_plan_items (
  id SERIAL PRIMARY KEY,
  change_plan_id INTEGER NOT NULL REFERENCES change_plans(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_name TEXT NOT NULL,
  classification TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  will_be_removed BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  users_json JSONB NOT NULL DEFAULT '[]',
  metadata_json JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS change_plan_items_change_plan_id_idx
  ON change_plan_items(change_plan_id);
CREATE INDEX IF NOT EXISTS change_plan_items_item_type_idx
  ON change_plan_items(item_type);

CREATE TABLE IF NOT EXISTS change_plan_diffs (
  id SERIAL PRIMARY KEY,
  change_plan_id INTEGER NOT NULL REFERENCES change_plans(id) ON DELETE CASCADE,
  before_json JSONB NOT NULL DEFAULT '{}',
  after_json JSONB NOT NULL DEFAULT '{}',
  rollback_json JSONB NOT NULL DEFAULT '{}',
  diff_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS change_plan_diffs_change_plan_id_idx
  ON change_plan_diffs(change_plan_id);
