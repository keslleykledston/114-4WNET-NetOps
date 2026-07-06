CREATE TABLE IF NOT EXISTS "bgp_customers" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(200) NOT NULL,
  "code" varchar(64) NOT NULL,
  "asn" integer NOT NULL,
  "type" varchar(32) NOT NULL DEFAULT 'customer',
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "parent_customer_id" integer,
  "as_set" varchar(255),
  "irr_source" varchar(64),
  "irr_validation_mode" varchar(32),
  "rpki_validation_mode" varchar(32),
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" integer,
  "updated_by" integer
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_bgp_customers_code" ON "bgp_customers" ("code");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_bgp_customers_asn" ON "bgp_customers" ("asn");
CREATE INDEX IF NOT EXISTS "idx_bgp_customers_status" ON "bgp_customers" ("status");
CREATE INDEX IF NOT EXISTS "idx_bgp_customers_parent_customer_id" ON "bgp_customers" ("parent_customer_id");

CREATE TABLE IF NOT EXISTS "bgp_customer_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "customer_id" integer NOT NULL REFERENCES "bgp_customers"("id") ON DELETE cascade,
  "device_id" integer NOT NULL REFERENCES "devices"("id") ON DELETE cascade,
  "address_family" varchar(16) NOT NULL DEFAULT 'ipv4',
  "neighbor_ipv4" varchar(64),
  "neighbor_ipv6" varchar(128),
  "interface_name" varchar(128),
  "vrf_name" varchar(128),
  "import_route_policy" varchar(128),
  "export_route_policy" varchar(128),
  "origin_route_policy" varchar(128),
  "ipv4_prefix_list" varchar(128),
  "ipv6_prefix_list" varchar(128),
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "source" varchar(32) NOT NULL DEFAULT 'manual',
  "last_snapshot_id" integer,
  "last_seen_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_bgp_customer_connections_customer_id" ON "bgp_customer_connections" ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_bgp_customer_connections_device_id" ON "bgp_customer_connections" ("device_id");
CREATE INDEX IF NOT EXISTS "idx_bgp_customer_connections_neighbor_ipv4" ON "bgp_customer_connections" ("neighbor_ipv4");
CREATE INDEX IF NOT EXISTS "idx_bgp_customer_connections_neighbor_ipv6" ON "bgp_customer_connections" ("neighbor_ipv6");

CREATE TABLE IF NOT EXISTS "bgp_authorized_prefixes" (
  "id" serial PRIMARY KEY NOT NULL,
  "customer_id" integer NOT NULL REFERENCES "bgp_customers"("id") ON DELETE cascade,
  "connection_id" integer REFERENCES "bgp_customer_connections"("id") ON DELETE set null,
  "prefix" varchar(64) NOT NULL,
  "address_family" varchar(16) NOT NULL DEFAULT 'ipv4',
  "origin_asn" integer,
  "max_prefix_length" integer,
  "source" varchar(32) NOT NULL DEFAULT 'manual',
  "validation_status" varchar(24) NOT NULL DEFAULT 'active',
  "description" text,
  "valid_from" timestamp with time zone,
  "valid_until" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_bgp_authorized_prefixes_customer_id" ON "bgp_authorized_prefixes" ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_bgp_authorized_prefixes_prefix" ON "bgp_authorized_prefixes" ("prefix");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_bgp_authorized_prefixes_customer_prefix_afi" ON "bgp_authorized_prefixes" ("customer_id", "prefix", "address_family");

CREATE TABLE IF NOT EXISTS "bgp_exit_points" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(200) NOT NULL,
  "slug" varchar(120) NOT NULL,
  "type" varchar(32) NOT NULL DEFAULT 'upstream',
  "asn" integer,
  "circuit_id" varchar(64),
  "device_id" integer REFERENCES "devices"("id") ON DELETE set null,
  "neighbor_ipv4" varchar(64),
  "neighbor_ipv6" varchar(128),
  "export_route_policy" varchar(128),
  "enabled_ipv4" boolean NOT NULL DEFAULT true,
  "enabled_ipv6" boolean NOT NULL DEFAULT true,
  "display_order" integer NOT NULL DEFAULT 0,
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_bgp_exit_points_slug" ON "bgp_exit_points" ("slug");
CREATE INDEX IF NOT EXISTS "idx_bgp_exit_points_circuit_id" ON "bgp_exit_points" ("circuit_id");
CREATE INDEX IF NOT EXISTS "idx_bgp_exit_points_type" ON "bgp_exit_points" ("type");
CREATE INDEX IF NOT EXISTS "idx_bgp_exit_points_device_id" ON "bgp_exit_points" ("device_id");

CREATE TABLE IF NOT EXISTS "bgp_exit_community_actions" (
  "id" serial PRIMARY KEY NOT NULL,
  "exit_point_id" integer NOT NULL REFERENCES "bgp_exit_points"("id") ON DELETE cascade,
  "action" varchar(24) NOT NULL,
  "community" varchar(64) NOT NULL,
  "label" varchar(120) NOT NULL,
  "risk_level" varchar(16) NOT NULL DEFAULT 'low',
  "address_family" varchar(16),
  "enabled" boolean NOT NULL DEFAULT true,
  "description" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_bgp_exit_community_actions_exit_point_id" ON "bgp_exit_community_actions" ("exit_point_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_bgp_exit_community_actions_exit_action_family" ON "bgp_exit_community_actions" ("exit_point_id", "action", "address_family");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_bgp_exit_community_actions_exit_community" ON "bgp_exit_community_actions" ("exit_point_id", "community");

CREATE TABLE IF NOT EXISTS "bgp_registry_audit_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_type" varchar(64) NOT NULL,
  "entity_id" integer NOT NULL,
  "action" varchar(32) NOT NULL,
  "before_json" text,
  "after_json" text,
  "actor_user_id" integer,
  "reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_bgp_registry_audit_log_entity" ON "bgp_registry_audit_log" ("entity_type", "entity_id");
