import { boolean, index, integer, jsonb, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth.js";

export const tenantsTable = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const connectorsTable = pgTable(
  "connectors",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("PENDING"),
    version: text("version"),
    connectorTokenHash: text("connector_token_hash").notNull(),
    wireguardIp: text("wireguard_ip"),
    wireguardPublicKey: text("wireguard_public_key"),
    wireguardPrivateKeyEnc: text("wireguard_private_key_enc"),
    wireguardServerPublicKey: text("wireguard_server_public_key"),
    wireguardEndpoint: text("wireguard_endpoint"),
    wireguardAllowedIps: text("wireguard_allowed_ips"),
    lastHeartbeat: timestamp("last_heartbeat"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    tenantNameIdx: index("connectors_tenant_name_idx").on(table.tenantId, table.name),
    statusIdx: index("connectors_status_idx").on(table.status),
  }),
);

export const connectorNetworksTable = pgTable(
  "connector_networks",
  {
    id: serial("id").primaryKey(),
    connectorId: integer("connector_id")
      .notNull()
      .references(() => connectorsTable.id, { onDelete: "cascade" }),
    networkCidr: text("network_cidr").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    connectorIdx: index("connector_networks_connector_id_idx").on(table.connectorId),
  }),
);

export const connectorJobsTable = pgTable(
  "connector_jobs",
  {
    id: serial("id").primaryKey(),
    connectorId: integer("connector_id")
      .notNull()
      .references(() => connectorsTable.id, { onDelete: "cascade" }),
    jobType: text("job_type").notNull(),
    targetIp: text("target_ip"),
    targetPort: integer("target_port"),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull().default({}),
    maskedPayloadJson: jsonb("masked_payload_json").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("PENDING"),
    deviceId: integer("device_id"),
    correlationId: text("correlation_id"),
    createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    timeoutSeconds: integer("timeout_seconds").notNull().default(120),
  },
  (table) => ({
    connectorStatusIdx: index("connector_jobs_connector_status_idx").on(table.connectorId, table.status),
    deviceIdx: index("connector_jobs_device_id_idx").on(table.deviceId),
    correlationIdx: index("connector_jobs_correlation_id_idx").on(table.correlationId),
  }),
);

export const connectorJobResultsTable = pgTable("connector_job_results", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .unique()
    .references(() => connectorJobsTable.id, { onDelete: "cascade" }),
  success: boolean("success").notNull().default(false),
  stdout: text("stdout"),
  stderr: text("stderr"),
  exitCode: integer("exit_code"),
  resultJson: jsonb("result_json").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const connectorHeartbeatsTable = pgTable(
  "connector_heartbeats",
  {
    id: serial("id").primaryKey(),
    connectorId: integer("connector_id")
      .notNull()
      .references(() => connectorsTable.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    wireguardStatus: text("wireguard_status"),
    cpuUsage: real("cpu_usage"),
    memoryUsage: real("memory_usage"),
    routesCount: integer("routes_count"),
    natEnabled: boolean("nat_enabled"),
    lanIp: text("lan_ip"),
    wgIp: text("wg_ip"),
    version: text("version"),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
  },
  (table) => ({
    connectorReceivedIdx: index("connector_heartbeats_connector_received_idx").on(
      table.connectorId,
      table.receivedAt,
    ),
  }),
);

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertConnectorSchema = createInsertSchema(connectorsTable).omit({
  id: true,
  connectorTokenHash: true,
  createdAt: true,
  updatedAt: true,
  lastHeartbeat: true,
});

export type Tenant = typeof tenantsTable.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Connector = typeof connectorsTable.$inferSelect;
export type ConnectorJob = typeof connectorJobsTable.$inferSelect;
export type ConnectorJobResult = typeof connectorJobResultsTable.$inferSelect;
export type ConnectorHeartbeat = typeof connectorHeartbeatsTable.$inferSelect;
export type ConnectorNetwork = typeof connectorNetworksTable.$inferSelect;
