import { index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";

export const bgpPeerDrilldownSnapshotsTable = pgTable("bgp_peer_drilldown_snapshots", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  peer: text("peer").notNull(),
  source: text("source").notNull(),
  configBuildSource: text("config_build_source").notNull(),
  peerHash: text("peer_hash").notNull(),
  collectedAt: timestamp("collected_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  snapshotJson: jsonb("snapshot_json").notNull(),
  runtimeJson: jsonb("runtime_json"),
  warnings: jsonb("warnings").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  devicePeerCreatedAtIdx: index("bgp_peer_drilldown_snapshots_device_peer_created_idx").on(
    table.deviceId,
    table.peer,
    table.createdAt,
  ),
  devicePeerExpiresAtIdx: index("bgp_peer_drilldown_snapshots_device_peer_expires_idx").on(
    table.deviceId,
    table.peer,
    table.expiresAt,
  ),
  sourceIdx: index("bgp_peer_drilldown_snapshots_source_idx").on(table.source),
  peerHashIdx: index("bgp_peer_drilldown_snapshots_peer_hash_idx").on(table.peerHash),
}));

export type BgpPeerDrilldownSnapshot = typeof bgpPeerDrilldownSnapshotsTable.$inferSelect;
export type InsertBgpPeerDrilldownSnapshot = typeof bgpPeerDrilldownSnapshotsTable.$inferInsert;
