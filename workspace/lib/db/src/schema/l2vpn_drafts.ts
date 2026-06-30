import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const l2vpnDraftsTable = pgTable("l2vpn_drafts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  notes: text("notes"),
  circuitIds: jsonb("circuit_ids").notNull().default([]),
  edits: jsonb("edits").notNull().default([]),
  validationJson: jsonb("validation_json").notNull().default({}),
  status: text("status").notNull().default("draft"),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type L2VpnDraft = typeof l2vpnDraftsTable.$inferSelect;
export type InsertL2VpnDraft = typeof l2vpnDraftsTable.$inferInsert;
