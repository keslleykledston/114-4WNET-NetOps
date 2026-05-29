-- H2.1 SNMP_FAST operational interfaces (pilot)

CREATE TABLE IF NOT EXISTS operational_collection_jobs (
  id serial PRIMARY KEY,
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  layer text NOT NULL DEFAULT 'snmp_fast',
  scope text NOT NULL DEFAULT 'interfaces',
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_summary text,
  created_by text
);

CREATE INDEX IF NOT EXISTS idx_operational_collection_jobs_device_started
  ON operational_collection_jobs(device_id, started_at DESC);

CREATE TABLE IF NOT EXISTS operational_interfaces (
  id serial PRIMARY KEY,
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  collection_job_id integer REFERENCES operational_collection_jobs(id) ON DELETE SET NULL,
  if_index integer NOT NULL,
  if_name text NOT NULL,
  if_descr text,
  if_alias text,
  admin_status text NOT NULL DEFAULT 'unknown',
  oper_status text NOT NULL DEFAULT 'unknown',
  if_high_speed_mbps integer,
  if_speed_bps bigint,
  if_last_change_ticks bigint,
  hc_in_octets bigint,
  hc_out_octets bigint,
  source text NOT NULL DEFAULT 'snmp',
  collected_at timestamptz NOT NULL DEFAULT now(),
  freshness_status text NOT NULL DEFAULT 'unknown',
  freshness_expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_operational_interfaces_device_collected
  ON operational_interfaces(device_id, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_interfaces_device_ifindex
  ON operational_interfaces(device_id, if_index, collected_at DESC);
