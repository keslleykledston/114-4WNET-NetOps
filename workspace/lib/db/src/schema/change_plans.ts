import { index, integer, jsonb, pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices.js";

export const changePlansTable = pgTable("change_plans", {
  id: serial("id").primaryKey(),
  module: text("module").notNull(),
  changeType: text("change_type").notNull(),
  deviceId: integer("device_id")
    .notNull()
    .references(() => devicesTable.id, { onDelete: "cascade" }),
  createdBy: text("created_by"),
  status: text("status", {
    enum: ["draft", "valid", "invalid", "exported", "closed"],
  }).notNull().default("draft"),
  ticketRef: text("ticket_ref"),
  sourceObjectType: text("source_object_type"),
  sourceObjectId: text("source_object_id"),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  deviceIdx: index("change_plans_device_id_idx").on(table.deviceId),
  moduleIdx: index("change_plans_module_idx").on(table.module),
  statusIdx: index("change_plans_status_idx").on(table.status),
  createdAtIdx: index("change_plans_created_at_idx").on(table.createdAt),
  sourceIdx: index("change_plans_source_object_idx").on(table.sourceObjectType, table.sourceObjectId),
}));

export const changePlanSnapshotsTable = pgTable("change_plan_snapshots", {
  id: serial("id").primaryKey(),
  changePlanId: integer("change_plan_id")
    .notNull()
    .references(() => changePlansTable.id, { onDelete: "cascade" }),
  snapshotJson: jsonb("snapshot_json").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  changePlanIdx: index("change_plan_snapshots_change_plan_id_idx").on(table.changePlanId),
}));

export const changePlanItemsTable = pgTable("change_plan_items", {
  id: serial("id").primaryKey(),
  changePlanId: integer("change_plan_id")
    .notNull()
    .references(() => changePlansTable.id, { onDelete: "cascade" }),
  itemType: text("item_type").notNull(),
  itemName: text("item_name").notNull(),
  classification: text("classification", {
    enum: ["exclusive", "shared", "global", "ambiguous"],
  }).notNull(),
  usageCount: integer("usage_count").notNull().default(0),
  willBeRemoved: boolean("will_be_removed").notNull().default(false),
  reason: text("reason"),
  usersJson: jsonb("users_json").notNull().default([]),
  metadataJson: jsonb("metadata_json").notNull().default({}),
}, (table) => ({
  changePlanIdx: index("change_plan_items_change_plan_id_idx").on(table.changePlanId),
  itemTypeIdx: index("change_plan_items_item_type_idx").on(table.itemType),
}));

export const changePlanDiffsTable = pgTable("change_plan_diffs", {
  id: serial("id").primaryKey(),
  changePlanId: integer("change_plan_id")
    .notNull()
    .references(() => changePlansTable.id, { onDelete: "cascade" }),
  beforeJson: jsonb("before_json").notNull().default({}),
  afterJson: jsonb("after_json").notNull().default({}),
  rollbackJson: jsonb("rollback_json").notNull().default({}),
  diffJson: jsonb("diff_json").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  changePlanIdx: index("change_plan_diffs_change_plan_id_idx").on(table.changePlanId),
}));

export type ChangePlanRow = typeof changePlansTable.$inferSelect;
export type InsertChangePlanRow = typeof changePlansTable.$inferInsert;
export type ChangePlanSnapshotRow = typeof changePlanSnapshotsTable.$inferSelect;
export type ChangePlanItemRow = typeof changePlanItemsTable.$inferSelect;
export type ChangePlanDiffRow = typeof changePlanDiffsTable.$inferSelect;
