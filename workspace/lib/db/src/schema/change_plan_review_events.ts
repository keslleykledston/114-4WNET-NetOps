import { index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { changePlansTable } from "./change_plans.js";
import { usersTable } from "./auth.js";

export const changePlanReviewEventsTable = pgTable("change_plan_review_events", {
  id: serial("id").primaryKey(),
  changePlanId: integer("change_plan_id")
    .notNull()
    .references(() => changePlansTable.id, { onDelete: "cascade" }),
  actor: text("actor"),
  actorUserId: integer("actor_user_id")
    .references(() => usersTable.id, { onDelete: "set null" }),
  previousStatus: text("previous_status").notNull(),
  nextStatus: text("next_status").notNull(),
  note: text("note"),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  planCreatedIdx: index("change_plan_review_events_plan_id_idx").on(table.changePlanId, table.createdAt),
}));

export type ChangePlanReviewEventRow = typeof changePlanReviewEventsTable.$inferSelect;
