import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";

export const discoveryRunsTable = pgTable("discovery_runs", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  requestedContextsJson: jsonb("requested_contexts_json").notNull(),
  preferLiveSsh: boolean("prefer_live_ssh").notNull().default(true),
  allowSnmpFallback: boolean("allow_snmp_fallback").notNull().default(true),
  useCachedConfig: boolean("use_cached_config").notNull().default(true),
  status: text("status").notNull(),
  sshStatus: text("ssh_status").notNull().default("skipped"),
  sshMessage: text("ssh_message"),
  snmpStatus: text("snmp_status").notNull().default("skipped"),
  snmpMessage: text("snmp_message"),
  cachedConfigUsed: boolean("cached_config_used").notNull().default(false),
  sourceSummaryJson: jsonb("source_summary_json").notNull(),
  summaryJson: jsonb("summary_json").notNull(),
  warningsJson: jsonb("warnings_json").notNull(),
  startedAt: timestamp("started_at").notNull(),
  finishedAt: timestamp("finished_at"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const discoverySnapshotsTable = pgTable("discovery_snapshots", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  discoveryRunId: integer("discovery_run_id").notNull().references(() => discoveryRunsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  snapshotJson: jsonb("snapshot_json").notNull(),
  sourceSummaryJson: jsonb("source_summary_json").notNull(),
  parserVersion: text("parser_version").notNull().default("huawei-vrp-v1"),
  snapshotHash: text("snapshot_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const discoveryEvidenceTable = pgTable("discovery_evidence", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  discoveryRunId: integer("discovery_run_id").notNull().references(() => discoveryRunsTable.id, { onDelete: "cascade" }),
  context: text("context").notNull(),
  source: text("source").notNull(),
  commandOrOidGroup: text("command_or_oid_group"),
  sanitizedOutput: text("sanitized_output").notNull(),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").notNull(),
  finishedAt: timestamp("finished_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bgpRouteHistoryTable = pgTable("bgp_route_history", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  peerIp: text("peer_ip").notNull(),
  direction: text("direction").notNull(), // "received" | "advertised"
  queryTime: timestamp("query_time").notNull(),
  totalRoutes: integer("total_routes").notNull(),
  routesReturned: integer("routes_returned").notNull(),
  routesJson: jsonb("routes_json").notNull(), // Array of {prefix, asPath, origin}
  source: text("source").notNull(), // "ssh"
  status: text("status").notNull(), // "ok" | "error"
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DiscoveryRun = typeof discoveryRunsTable.$inferSelect;
export type InsertDiscoveryRun = typeof discoveryRunsTable.$inferInsert;
export type DiscoverySnapshot = typeof discoverySnapshotsTable.$inferSelect;
export type InsertDiscoverySnapshot = typeof discoverySnapshotsTable.$inferInsert;
export type DiscoveryEvidence = typeof discoveryEvidenceTable.$inferSelect;
export type InsertDiscoveryEvidence = typeof discoveryEvidenceTable.$inferInsert;
export type BgpRouteHistory = typeof bgpRouteHistoryTable.$inferSelect;
export type InsertBgpRouteHistory = typeof bgpRouteHistoryTable.$inferInsert;
