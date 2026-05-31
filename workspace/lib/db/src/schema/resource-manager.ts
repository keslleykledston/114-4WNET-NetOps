import { pgTable, serial, text, integer, timestamp, jsonb, boolean, uniqueIndex } from "drizzle-orm/pg-core";

export const resourcePoolsTable = pgTable("resource_pools", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  resourceType: text("resource_type").notNull(),
  vendor: text("vendor"),
  tenantId: integer("tenant_id"),
  siteId: integer("site_id"),
  rangeStart: integer("range_start").notNull(),
  rangeEnd: integer("range_end").notNull(),
  metadataJson: jsonb("metadata_json").default({}),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const resourceAllocationsTable = pgTable("resource_allocations", {
  id: serial("id").primaryKey(),
  resourcePoolId: integer("resource_pool_id").notNull().references(() => resourcePoolsTable.id, { onDelete: "cascade" }),
  resourceType: text("resource_type").notNull(),
  resourceValue: integer("resource_value").notNull(),
  status: text("status", { enum: ["ALLOCATED", "RESERVED", "RELEASED"] }).notNull(),
  deviceId: integer("device_id"),
  serviceRequestId: integer("service_request_id"),
  allocatedBy: text("allocated_by").notNull(),
  allocatedAt: timestamp("allocated_at").defaultNow(),
  releasedAt: timestamp("released_at"),
}, (table) => ({
  uniqueResource: uniqueIndex("unique_pool_resource").on(table.resourcePoolId, table.resourceValue),
}));

export const resourceReservationsTable = pgTable("resource_reservations", {
  id: serial("id").primaryKey(),
  resourcePoolId: integer("resource_pool_id").notNull().references(() => resourcePoolsTable.id, { onDelete: "cascade" }),
  resourceValue: integer("resource_value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ResourcePool = typeof resourcePoolsTable.$inferSelect;
export type ResourceAllocation = typeof resourceAllocationsTable.$inferSelect;
export type ResourceReservation = typeof resourceReservationsTable.$inferSelect;
