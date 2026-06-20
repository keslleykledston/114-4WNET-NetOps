import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices.js";

export const bgpPeerCollectionHistoryTable = pgTable("bgp_peer_collection_history", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  previousSnapshotId: integer("previous_snapshot_id"),
  currentSnapshotId: integer("current_snapshot_id"),
  collector: text("collector").notNull().default("snmp"),
  previousPeersJson: jsonb("previous_peers_json").notNull().default([]),
  currentPeersJson: jsonb("current_peers_json").notNull().default([]),
  removedPeersJson: jsonb("removed_peers_json").notNull().default([]),
  removedCount: integer("removed_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BgpPeerCollectionHistoryRow = typeof bgpPeerCollectionHistoryTable.$inferSelect;
export type InsertBgpPeerCollectionHistoryRow = typeof bgpPeerCollectionHistoryTable.$inferInsert;

