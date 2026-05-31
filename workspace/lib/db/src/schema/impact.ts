import { pgTable, serial, text, integer, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export const impactScenariosTable = pgTable("impact_scenarios", {
  id: serial("id").primaryKey(),
  targetType: text("target_type", {
    enum: ["DEVICE", "INTERFACE", "L2_CIRCUIT", "VSI", "BGP_PEER", "SERVICE", "RESOURCE"],
  }).notNull(),
  targetId: integer("target_id").notNull(),
  targetLabel: text("target_label").notNull(),
  severity: text("severity", { enum: ["CRITICAL", "WARNING", "INFO"] }).default("WARNING").notNull(),
  status: text("status", { enum: ["OPEN", "ACKNOWLEDGED", "RESOLVED"] }).default("OPEN").notNull(),
  summary: text("summary"),
  affectedCount: integer("affected_count").default(0),
  metadataJson: jsonb("metadata_json").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const impactAffectedItemsTable = pgTable("impact_affected_items", {
  id: serial("id").primaryKey(),
  scenarioId: integer("scenario_id").notNull().references(() => impactScenariosTable.id, { onDelete: "cascade" }),
  itemType: text("item_type").notNull(),
  itemId: integer("item_id").notNull(),
  itemLabel: text("item_label").notNull(),
  impactType: text("impact_type", {
    enum: ["DIRECT", "INDIRECT", "DEPENDENCY", "RESOURCE_COLLISION", "COMPLIANCE_RISK"],
  }).notNull(),
  severity: text("severity", { enum: ["CRITICAL", "WARNING", "INFO"] }).default("WARNING").notNull(),
  pathJson: jsonb("path_json").default({}),
  metadataJson: jsonb("metadata_json").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const impactSnapshotsTable = pgTable("impact_snapshots", {
  id: serial("id").primaryKey(),
  scopeType: text("scope_type").notNull(),
  scopeId: integer("scope_id"),
  scenarioCount: integer("scenario_count").default(0),
  affectedCount: integer("affected_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ImpactScenario = typeof impactScenariosTable.$inferSelect;
export type ImpactAffectedItem = typeof impactAffectedItemsTable.$inferSelect;
export type ImpactSnapshot = typeof impactSnapshotsTable.$inferSelect;
