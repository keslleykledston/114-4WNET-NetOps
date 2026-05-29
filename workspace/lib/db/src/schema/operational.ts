import { bigint, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";

export const operationalCollectionJobsTable = pgTable("operational_collection_jobs", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  layer: text("layer").notNull().default("snmp_fast"),
  scope: text("scope").notNull().default("interfaces"),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  errorSummary: text("error_summary"),
  createdBy: text("created_by"),
});

export const operationalInterfacesTable = pgTable("operational_interfaces", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  collectionJobId: integer("collection_job_id").references(() => operationalCollectionJobsTable.id, { onDelete: "set null" }),
  ifIndex: integer("if_index").notNull(),
  ifName: text("if_name").notNull(),
  ifDescr: text("if_descr"),
  ifAlias: text("if_alias"),
  adminStatus: text("admin_status").notNull().default("unknown"),
  operStatus: text("oper_status").notNull().default("unknown"),
  ifHighSpeedMbps: integer("if_high_speed_mbps"),
  ifSpeedBps: bigint("if_speed_bps", { mode: "number" }),
  ifLastChangeTicks: bigint("if_last_change_ticks", { mode: "number" }),
  hcInOctets: bigint("hc_in_octets", { mode: "bigint" }),
  hcOutOctets: bigint("hc_out_octets", { mode: "bigint" }),
  source: text("source").notNull().default("snmp"),
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
  freshnessStatus: text("freshness_status").notNull().default("unknown"),
  freshnessExpiresAt: timestamp("freshness_expires_at"),
});

export type OperationalCollectionJob = typeof operationalCollectionJobsTable.$inferSelect;
export type OperationalInterface = typeof operationalInterfacesTable.$inferSelect;
