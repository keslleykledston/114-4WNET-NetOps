import { bigint, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";

export const operationalBgpCollectionJobsTable = pgTable("operational_bgp_collection_jobs", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  errorCode: text("error_code"),
  peerCount: integer("peer_count"),
  freshness: text("freshness").notNull().default("unknown"),
});

export const operationalBgpPeersTable = pgTable("operational_bgp_peers", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  collectionJobId: integer("collection_job_id").references(() => operationalBgpCollectionJobsTable.id, {
    onDelete: "set null",
  }),
  peerIp: text("peer_ip").notNull(),
  peerAs: bigint("peer_as", { mode: "number" }),
  peerType: text("peer_type").notNull().default("unknown"),
  vrf: text("vrf"),
  afi: text("afi").notNull().default("ipv4"),
  safi: text("safi").notNull().default("unicast"),
  adminStatus: text("admin_status").notNull().default("unknown"),
  operStatus: text("oper_status").notNull().default("unknown"),
  fsmState: text("fsm_state").notNull().default("unknown"),
  uptimeSeconds: bigint("uptime_seconds", { mode: "number" }),
  receivedPrefixes: integer("received_prefixes"),
  acceptedPrefixes: integer("accepted_prefixes"),
  advertisedPrefixes: integer("advertised_prefixes"),
  lastChange: timestamp("last_change"),
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
});

export type OperationalBgpCollectionJob = typeof operationalBgpCollectionJobsTable.$inferSelect;
export type OperationalBgpPeer = typeof operationalBgpPeersTable.$inferSelect;
