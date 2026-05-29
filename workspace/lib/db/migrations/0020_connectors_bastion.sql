-- Connectors / Bastion (WireGuard transport + Connector Agent execution)

CREATE TABLE IF NOT EXISTS tenants (
  id serial PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS connectors (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'PENDING',
  version text,
  connector_token_hash text NOT NULL,
  wireguard_ip text,
  wireguard_public_key text,
  wireguard_private_key_enc text,
  wireguard_server_public_key text,
  wireguard_endpoint text,
  wireguard_allowed_ips text,
  last_heartbeat timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS connectors_tenant_id_idx ON connectors (tenant_id);
CREATE INDEX IF NOT EXISTS connectors_status_idx ON connectors (status);
CREATE INDEX IF NOT EXISTS connectors_last_heartbeat_idx ON connectors (last_heartbeat);

CREATE TABLE IF NOT EXISTS connector_networks (
  id serial PRIMARY KEY,
  connector_id integer NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  network_cidr text NOT NULL,
  description text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connector_networks_connector_id_idx ON connector_networks (connector_id);

CREATE TABLE IF NOT EXISTS connector_jobs (
  id serial PRIMARY KEY,
  connector_id integer NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  target_ip text,
  target_port integer,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING',
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  started_at timestamp,
  finished_at timestamp,
  timeout_seconds integer NOT NULL DEFAULT 120
);

CREATE INDEX IF NOT EXISTS connector_jobs_connector_status_idx ON connector_jobs (connector_id, status);
CREATE INDEX IF NOT EXISTS connector_jobs_created_at_idx ON connector_jobs (created_at DESC);

CREATE TABLE IF NOT EXISTS connector_job_results (
  id serial PRIMARY KEY,
  job_id integer NOT NULL UNIQUE REFERENCES connector_jobs(id) ON DELETE CASCADE,
  success boolean NOT NULL DEFAULT false,
  stdout text,
  stderr text,
  exit_code integer,
  result_json jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS connector_heartbeats (
  id serial PRIMARY KEY,
  connector_id integer NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  status text NOT NULL,
  wireguard_status text,
  cpu_usage real,
  memory_usage real,
  routes_count integer,
  nat_enabled boolean,
  lan_ip text,
  wg_ip text,
  version text,
  received_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connector_heartbeats_connector_received_idx
  ON connector_heartbeats (connector_id, received_at DESC);

ALTER TABLE devices ADD COLUMN IF NOT EXISTS connector_id integer REFERENCES connectors(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS devices_connector_id_idx ON devices (connector_id);
