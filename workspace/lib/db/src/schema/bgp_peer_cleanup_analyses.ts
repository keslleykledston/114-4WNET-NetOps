import { index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";

export const bgpPeerCleanupAnalysesTable = pgTable("bgp_peer_cleanup_analyses", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id")
    .notNull()
    .references(() => devicesTable.id, { onDelete: "cascade" }),
  peerIp: text("peer_ip").notNull(),
  vrf: text("vrf"),
  afi: text("afi").notNull(),
  safi: text("safi").notNull(),
  state: text("state").notNull(),
  recommendation: text("recommendation").notNull(),
  riskLevel: text("risk_level").notNull(),
  analysisJson: jsonb("analysis_json").notNull().default({}),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  exportedAt: timestamp("exported_at"),
}, (table) => ({
  devicePeerIdx: index("bgp_peer_cleanup_analyses_device_peer_idx").on(table.deviceId, table.peerIp),
  createdAtIdx: index("bgp_peer_cleanup_analyses_created_at_idx").on(table.createdAt),
}));

export type BgpPeerCleanupAnalysisRow = typeof bgpPeerCleanupAnalysesTable.$inferSelect;
export type InsertBgpPeerCleanupAnalysisRow = typeof bgpPeerCleanupAnalysesTable.$inferInsert;
