import { index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";

export const l2CircuitsTable = pgTable("l2_circuits", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  circuitType: text("circuit_type").notNull(), // vlan | dot1q_subif | l2vc | vpws | vsi | vpls
  serviceId: text("service_id"),
  name: text("name").notNull(),
  description: text("description"),
  outerVlan: integer("outer_vlan"),
  innerVlan: integer("inner_vlan"),
  vcId: text("vc_id"),
  vsiName: text("vsi_name"),
  vsiId: text("vsi_id"),
  localInterface: text("local_interface"),
  parentInterface: text("parent_interface"),
  peerIp: text("peer_ip"),
  adminStatus: text("admin_status"), // UP | DOWN | UNKNOWN
  operStatus: text("oper_status"), // UP | DOWN | UNKNOWN
  pwStatus: text("pw_status"),
  macCount: integer("mac_count"),
  source: text("source").notNull().default("ssh_live"), // ssh_live | cached_config
  rawEvidence: text("raw_evidence"), // evidence string, max 240 chars
  findings: jsonb("findings").default([]).notNull(), // array of {code, severity, message}
  firstSeen: timestamp("first_seen").notNull(),
  lastSeen: timestamp("last_seen").notNull(),
  discoveryRunId: text("discovery_run_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  deviceIdIdx: index("l2_circuits_device_id_idx").on(table.deviceId),
  circuitTypeIdx: index("l2_circuits_circuit_type_idx").on(table.circuitType),
  vcIdIdx: index("l2_circuits_vc_id_idx").on(table.vcId),
  vsiNameIdx: index("l2_circuits_vsi_name_idx").on(table.vsiName),
  discoveryRunIdIdx: index("l2_circuits_discovery_run_id_idx").on(table.discoveryRunId),
  deviceCreatedAtIdx: index("l2_circuits_device_created_at_idx").on(table.deviceId, table.createdAt),
}));

export const l2DiscoveryJobsTable = pgTable("l2_discovery_jobs", {
  id: serial("id").primaryKey(),
  runId: text("run_id").notNull().unique(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // pending | running | completed | failed
  startedAt: timestamp("started_at").notNull(),
  finishedAt: timestamp("finished_at"),
  circuitCount: integer("circuit_count"),
  findingsCount: integer("findings_count"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  runIdIdx: index("l2_discovery_jobs_run_id_idx").on(table.runId),
  deviceIdIdx: index("l2_discovery_jobs_device_id_idx").on(table.deviceId),
  statusIdx: index("l2_discovery_jobs_status_idx").on(table.status),
  createdAtIdx: index("l2_discovery_jobs_created_at_idx").on(table.createdAt),
}));

export type L2Circuit = typeof l2CircuitsTable.$inferSelect;
export type InsertL2Circuit = typeof l2CircuitsTable.$inferInsert;
export type L2DiscoveryJob = typeof l2DiscoveryJobsTable.$inferSelect;
export type InsertL2DiscoveryJob = typeof l2DiscoveryJobsTable.$inferInsert;
