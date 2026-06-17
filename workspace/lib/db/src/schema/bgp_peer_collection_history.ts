import { index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";
import { snmpSnapshotsTable } from "./snmp_snapshots";

export const bgpPeerCollectionHistoryTable = pgTable("bgp_peer_collection_history", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id")
    .notNull()
    .references(() => devicesTable.id, { onDelete: "cascade" }),
  previousSnapshotId: integer("previous_snapshot_id")
    .references(() => snmpSnapshotsTable.id, { onDelete: "set null" }),
  currentSnapshotId: integer("current_snapshot_id")
    .references(() => snmpSnapshotsTable.id, { onDelete: "set null" }),
  collector: text("collector").notNull().default("snmp"),
  previousPeersJson: jsonb("previous_peers_json").notNull().default([]),
  currentPeersJson: jsonb("current_peers_json").notNull().default([]),
  removedPeersJson: jsonb("removed_peers_json").notNull().default([]),
  removedCount: integer("removed_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  deviceCreatedAtIdx: index("bgp_peer_collection_history_device_created_at_idx").on(table.deviceId, table.createdAt),
  currentSnapshotIdx: index("bgp_peer_collection_history_current_snapshot_idx").on(table.currentSnapshotId),
}));

export type BgpPeerCollectionHistoryRow = typeof bgpPeerCollectionHistoryTable.$inferSelect;
export type InsertBgpPeerCollectionHistoryRow = typeof bgpPeerCollectionHistoryTable.$inferInsert;
