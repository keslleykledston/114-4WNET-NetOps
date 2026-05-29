import { index, pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { connectorsTable } from "./connectors.js";

export const deviceGroupsTable = pgTable("device_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const devicesTable = pgTable("devices", {
  id: serial("id").primaryKey(),
  hostname: text("hostname").notNull(),
  ipAddress: text("ip_address").notNull().unique(),
  vendor: text("vendor").notNull().default("cisco"),
  platform: text("platform").notNull().default("ios"),
  sshPort: integer("ssh_port").notNull().default(22),
  username: text("username").notNull(),
  passwordEncrypted: text("password_encrypted").notNull(),
  site: text("site").notNull(),
  role: text("role"),
  groupId: integer("group_id").references(() => deviceGroupsTable.id),
  connectorId: integer("connector_id").references(() => connectorsTable.id, { onDelete: "set null" }),
  snmpCommunity: text("snmp_community"),
  netboxDeviceId: integer("netbox_device_id"),
  lastSeen: timestamp("last_seen"),
  status: text("status").notNull().default("unknown"),
  complianceProfileName: text("compliance_profile_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  hostnameIdx: index("devices_hostname_idx").on(table.hostname),
  statusIdx: index("devices_status_idx").on(table.status),
  vendorIdx: index("devices_vendor_idx").on(table.vendor),
  siteIdx: index("devices_site_idx").on(table.site),
  complianceProfileIdx: index("idx_devices_compliance_profile").on(table.complianceProfileName),
}));

export const insertDeviceGroupSchema = createInsertSchema(deviceGroupsTable).omit({ id: true, createdAt: true });
export const insertDeviceSchema = createInsertSchema(devicesTable).omit({ id: true, createdAt: true, updatedAt: true, lastSeen: true });

export type InsertDeviceGroup = z.infer<typeof insertDeviceGroupSchema>;
export type DeviceGroup = typeof deviceGroupsTable.$inferSelect;
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Device = typeof devicesTable.$inferSelect;
