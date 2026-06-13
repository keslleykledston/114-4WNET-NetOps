import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { devicesTable } from "./devices.js";
import { tenantsTable } from "./connectors.js";

export const configGeneratorIdRangesTable = pgTable("config_generator_id_ranges", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  siteId: integer("site_id"),
  rangeKey: text("range_key").notNull(),
  idType: text("id_type").notNull(),
  serviceType: text("service_type"),
  rangeStart: integer("range_start").notNull(),
  rangeEnd: integer("range_end").notNull(),
  reserved: boolean("reserved").notNull().default(false),
  policyJson: jsonb("policy_json").notNull().default({}),
  source: text("source").notNull().default("builtin"),
  version: text("version").notNull().default("2026.05"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantRangeKeyUq: uniqueIndex("config_generator_id_ranges_tenant_range_key_uq").on(table.tenantId, table.rangeKey, table.idType),
  tenantTypeIdx: index("config_generator_id_ranges_tenant_type_idx").on(table.tenantId, table.idType),
  tenantServiceIdx: index("config_generator_id_ranges_tenant_service_idx").on(table.tenantId, table.idType, table.serviceType),
}));

export const configGeneratorDiscoveredIdsTable = pgTable("config_generator_discovered_ids", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  siteId: integer("site_id"),
  siteCode: text("site_code"),
  deviceId: integer("device_id").references(() => devicesTable.id, { onDelete: "cascade" }),
  idType: text("id_type").notNull(),
  idValue: integer("id_value").notNull(),
  parentInterface: text("parent_interface"),
  interfaceName: text("interface_name"),
  serviceType: text("service_type"),
  serviceName: text("service_name"),
  circuitId: text("circuit_id"),
  customerName: text("customer_name"),
  status: text("status").notNull().default("active"),
  source: text("source").notNull(),
  evidenceRef: text("evidence_ref"),
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  confidence: text("confidence").notNull().default("medium"),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantTypeValueIdx: index("config_generator_discovered_ids_tenant_type_value_idx").on(table.tenantId, table.idType, table.idValue),
  tenantSiteTypeValueIdx: index("config_generator_discovered_ids_tenant_site_type_value_idx").on(table.tenantId, table.siteCode, table.idType, table.idValue),
  tenantDeviceTypeValueIdx: index("config_generator_discovered_ids_tenant_device_type_value_idx").on(table.tenantId, table.deviceId, table.idType, table.idValue),
  tenantTypeServiceIdx: index("config_generator_discovered_ids_tenant_type_service_idx").on(table.tenantId, table.idType, table.serviceType),
  tenantTypeStatusIdx: index("config_generator_discovered_ids_tenant_type_status_idx").on(table.tenantId, table.idType, table.status),
  dedupeUq: uniqueIndex("config_generator_discovered_ids_dedupe_uq").on(
    table.tenantId,
    table.deviceId,
    table.idType,
    table.idValue,
    table.parentInterface,
    table.interfaceName,
  ),
}));

export const insertConfigGeneratorIdRangeSchema = createInsertSchema(configGeneratorIdRangesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertConfigGeneratorDiscoveredIdSchema = createInsertSchema(configGeneratorDiscoveredIdsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ConfigGeneratorIdRange = typeof configGeneratorIdRangesTable.$inferSelect;
export type ConfigGeneratorDiscoveredId = typeof configGeneratorDiscoveredIdsTable.$inferSelect;
export type InsertConfigGeneratorIdRange = z.infer<typeof insertConfigGeneratorIdRangeSchema>;
export type InsertConfigGeneratorDiscoveredId = z.infer<typeof insertConfigGeneratorDiscoveredIdSchema>;
