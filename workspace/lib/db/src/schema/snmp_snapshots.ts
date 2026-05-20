import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";

export const snmpSnapshotsTable = pgTable("snmp_snapshots", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  success: boolean("success").notNull().default(false),
  errorMessage: text("error_message"),
  interfacesJson: text("interfaces_json"),
  bgpPeersJson: text("bgp_peers_json"),
  vrfsJson: text("vrfs_json"),
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
});

export type SnmpSnapshot = typeof snmpSnapshotsTable.$inferSelect;
