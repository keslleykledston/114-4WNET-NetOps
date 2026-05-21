import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";

export const bgpPeerRoleOverridesTable = pgTable("bgp_peer_role_overrides", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id),
  peerIp: text("peer_ip").notNull(),
  remoteAs: integer("remote_as"),
  addressFamily: text("address_family").notNull(),
  role: text("role").notNull(),
  label: text("label"),
  notes: text("notes"),
  source: text("source").notNull().default("manual_override"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
}, (table) => ({
  devicePeerAfUnique: uniqueIndex("bgp_peer_role_overrides_device_peer_af_uq").on(
    table.deviceId,
    table.peerIp,
    table.addressFamily,
  ),
}));

export type BgpPeerRoleOverride = typeof bgpPeerRoleOverridesTable.$inferSelect;
export type InsertBgpPeerRoleOverride = typeof bgpPeerRoleOverridesTable.$inferInsert;
