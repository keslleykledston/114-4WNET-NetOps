import { index, pgTable, serial, text, integer, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { connectorsTable } from "./connectors";
import { devicesTable } from "./devices";

export const collectedConfigsTable = pgTable("collected_configs", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  connectorId: integer("connector_id").references(() => connectorsTable.id, { onDelete: "set null" }),
  connectorJobId: integer("connector_job_id"),
  source: text("source"),
  rawConfig: text("raw_config"),
  parsedVlans: text("parsed_vlans"),
  parsedInterfaces: text("parsed_interfaces"),
  parsedBgp: text("parsed_bgp"),
  parsedL2vpn: text("parsed_l2vpn"),
  parsedL3vpn: text("parsed_l3vpn"),
  parserStatus: text("parser_status"),
  parserError: text("parser_error"),
  parsedSummaryJson: jsonb("parsed_summary_json"),
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
});

export const configDiffsTable = pgTable("config_diffs", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  previousConfigId: integer("previous_config_id").references(() => collectedConfigsTable.id, { onDelete: "set null" }),
  currentConfigId: integer("current_config_id").notNull().references(() => collectedConfigsTable.id, { onDelete: "cascade" }),
  diffSummary: text("diff_summary"),
  diffText: text("diff_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  deviceIdx: index("config_diffs_device_id_idx").on(table.deviceId),
  currentConfigIdx: uniqueIndex("config_diffs_current_config_id_uq").on(table.currentConfigId),
  createdAtIdx: index("config_diffs_created_at_idx").on(table.createdAt),
}));

export const insertCollectedConfigSchema = createInsertSchema(collectedConfigsTable).omit({ id: true, collectedAt: true });

export type InsertCollectedConfig = z.infer<typeof insertCollectedConfigSchema>;
export type CollectedConfig = typeof collectedConfigsTable.$inferSelect;
export type ConfigDiff = typeof configDiffsTable.$inferSelect;
