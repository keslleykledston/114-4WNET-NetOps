import { boolean, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";

export const communityLibraryItemsTable = pgTable(
  "community_library_items",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id")
      .notNull()
      .references(() => devicesTable.id, { onDelete: "cascade" }),
    companyId: integer("company_id").notNull(),
    filterName: varchar("filter_name", { length: 128 }).notNull(),
    communityValue: varchar("community_value", { length: 512 }).notNull(),
    matchType: varchar("match_type", { length: 16 }).notNull(), // basic | advanced
    action: varchar("action", { length: 8 }).notNull().default("permit"), // permit | deny
    indexOrder: integer("index_order"),
    origin: varchar("origin", { length: 40 })
      .notNull()
      .default("discovered_running_config"), // discovered_running_config | discovered_live | manual
    description: text("description"),
    tagsJson: jsonb("tags_json"),
    isSystem: boolean("is_system").default(false),
    isActive: boolean("is_active").default(true),
    usageCount: integer("usage_count").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_community_lib_device_filter_value_match").on(
      table.deviceId,
      table.filterName,
      table.communityValue,
      table.matchType
    ),
  ]
);

export const communitySetsTable = pgTable(
  "community_sets",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id")
      .notNull()
      .references(() => devicesTable.id, { onDelete: "cascade" }),
    companyId: integer("company_id").notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    vrpObjectName: varchar("vrp_object_name", { length: 63 }).notNull(),
    origin: varchar("origin", { length: 40 })
      .notNull()
      .default("app_created"), // app_created | discovered_running_config
    discoveredMembersJson: jsonb("discovered_members_json"),
    impliedConfigPreview: text("implied_config_preview"),
    description: text("description"),
    status: varchar("status", { length: 32 }).notNull().default("draft"), // draft | ready | applied
    createdBy: integer("created_by"),
    updatedBy: integer("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_community_set_device_slug").on(table.deviceId, table.slug),
    uniqueIndex("uq_community_set_device_vrp_name").on(table.deviceId, table.vrpObjectName),
  ]
);

export const communitySetMembersTable = pgTable(
  "community_set_members",
  {
    id: serial("id").primaryKey(),
    communitySetId: integer("community_set_id")
      .notNull()
      .references(() => communitySetsTable.id, { onDelete: "cascade" }),
    communityValue: varchar("community_value", { length: 512 }).notNull(),
    linkedLibraryItemId: integer("linked_library_item_id").references(
      () => communityLibraryItemsTable.id,
      { onDelete: "set null" }
    ),
    missingInLibrary: boolean("missing_in_library").default(false),
    valueDescription: text("value_description"),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    uniqueIndex("uq_set_member_set_value").on(table.communitySetId, table.communityValue),
  ]
);

export const communityChangeAuditTable = pgTable("community_change_audit", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id")
    .notNull()
    .references(() => devicesTable.id, { onDelete: "cascade" }),
  communitySetId: integer("community_set_id").references(() => communitySetsTable.id, { onDelete: "set null" }),
  userId: integer("user_id"),
  action: varchar("action", { length: 24 }).notNull(), // preview | apply | rollback
  candidateConfigText: text("candidate_config_text").notNull(),
  commandSentText: text("command_sent_text"),
  deviceResponseText: text("device_response_text"),
  status: varchar("status", { length: 16 }).notNull(), // success | error | pending
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Types
export type CommunityLibraryItem = typeof communityLibraryItemsTable.$inferSelect;
export type InsertCommunityLibraryItem = typeof communityLibraryItemsTable.$inferInsert;
export type CommunitySet = typeof communitySetsTable.$inferSelect;
export type InsertCommunitySet = typeof communitySetsTable.$inferInsert;
export type CommunitySetMember = typeof communitySetMembersTable.$inferSelect;
export type InsertCommunitySetMember = typeof communitySetMembersTable.$inferInsert;
export type CommunityChangeAudit = typeof communityChangeAuditTable.$inferSelect;
export type InsertCommunityChangeAudit = typeof communityChangeAuditTable.$inferInsert;
