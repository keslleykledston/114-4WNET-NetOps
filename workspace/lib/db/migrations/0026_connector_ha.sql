CREATE TABLE IF NOT EXISTS connector_groups (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  strategy TEXT NOT NULL DEFAULT 'ACTIVE_PASSIVE',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS connector_groups_tenant_name_unique_idx
  ON connector_groups (tenant_id, name);

CREATE INDEX IF NOT EXISTS connector_groups_tenant_name_idx
  ON connector_groups (tenant_id, name);

CREATE TABLE IF NOT EXISTS connector_group_members (
  connector_group_id INTEGER NOT NULL REFERENCES connector_groups(id) ON DELETE CASCADE,
  connector_id INTEGER NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  weight INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (connector_group_id, connector_id)
);

CREATE INDEX IF NOT EXISTS connector_group_members_group_idx
  ON connector_group_members (connector_group_id);

CREATE INDEX IF NOT EXISTS connector_group_members_connector_idx
  ON connector_group_members (connector_id);

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS connector_group_id INTEGER REFERENCES connector_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS devices_connector_group_id_idx
  ON devices (connector_group_id);

INSERT INTO connector_groups (tenant_id, name, strategy, created_at, updated_at)
SELECT DISTINCT tenant_id, 'Default HA', 'ACTIVE_PASSIVE', NOW(), NOW()
FROM connectors
ON CONFLICT (tenant_id, name) DO UPDATE
SET updated_at = EXCLUDED.updated_at;

INSERT INTO connector_group_members (connector_group_id, connector_id, priority, weight)
SELECT
  cg.id,
  c.id,
  ROW_NUMBER() OVER (PARTITION BY c.tenant_id ORDER BY c.id),
  1
FROM connectors c
JOIN connector_groups cg
  ON cg.tenant_id = c.tenant_id
 AND cg.name = 'Default HA'
ON CONFLICT (connector_group_id, connector_id) DO NOTHING;

UPDATE devices d
SET connector_group_id = cg.id
FROM connectors c
JOIN connector_groups cg
  ON cg.tenant_id = c.tenant_id
 AND cg.name = 'Default HA'
WHERE d.connector_id = c.id
  AND d.connector_group_id IS NULL;
