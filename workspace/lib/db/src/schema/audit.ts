import { index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id"),
  action: text("action").notNull(),
  objectType: text("object_type").notNull(),
  objectId: text("object_id").notNull(),
  metadataJson: jsonb("metadata_json"),
  sourceIp: text("source_ip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  actionIdx: index("audit_logs_action_idx").on(table.action),
  objectTypeIdx: index("audit_logs_object_type_idx").on(table.objectType),
  objectIdIdx: index("audit_logs_object_id_idx").on(table.objectId),
  createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
}));

