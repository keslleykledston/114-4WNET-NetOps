import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
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

export const insertCollectedConfigSchema = createInsertSchema(collectedConfigsTable).omit({ id: true, collectedAt: true });

export type InsertCollectedConfig = z.infer<typeof insertCollectedConfigSchema>;
export type CollectedConfig = typeof collectedConfigsTable.$inferSelect;
