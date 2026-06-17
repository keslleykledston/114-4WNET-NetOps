import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth.js";
import { devicesTable } from "./devices.js";
import { tenantsTable } from "./connectors.js";

export const copilotEntityTypeValues = [
  "customer",
  "provider",
  "cdn",
  "ix",
  "device",
  "site",
  "circuit",
  "prefix",
  "route_policy",
  "community",
  "service",
] as const;

export type CopilotDbEntityType = (typeof copilotEntityTypeValues)[number];

export const copilotSessionsTable = pgTable(
  "copilot_sessions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    title: text("title"),
    anchorDeviceId: integer("anchor_device_id").references(() => devicesTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    tenantUserIdx: index("copilot_sessions_tenant_user_idx").on(table.tenantId, table.userId),
    updatedIdx: index("copilot_sessions_updated_at_idx").on(table.updatedAt),
  }),
);

export const copilotMessagesTable = pgTable(
  "copilot_messages",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => copilotSessionsTable.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionIdx: index("copilot_messages_session_id_idx").on(table.sessionId),
    createdIdx: index("copilot_messages_created_at_idx").on(table.createdAt),
  }),
);

export const copilotToolRunsTable = pgTable(
  "copilot_tool_runs",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").references(() => copilotSessionsTable.id, { onDelete: "set null" }),
    messageId: integer("message_id").references(() => copilotMessagesTable.id, { onDelete: "set null" }),
    toolName: text("tool_name").notNull(),
    inputJson: jsonb("input_json").$type<Record<string, unknown>>().notNull(),
    outputJson: jsonb("output_json").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("ok"),
    durationMs: integer("duration_ms"),
    sourceType: text("source_type"),
    sourceRef: text("source_ref"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionIdx: index("copilot_tool_runs_session_id_idx").on(table.sessionId),
    messageIdx: index("copilot_tool_runs_message_id_idx").on(table.messageId),
    toolIdx: index("copilot_tool_runs_tool_name_idx").on(table.toolName),
  }),
);

export const copilotFeedbackTable = pgTable(
  "copilot_feedback",
  {
    id: serial("id").primaryKey(),
    messageId: integer("message_id")
      .notNull()
      .references(() => copilotMessagesTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    rating: text("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    messageIdx: index("copilot_feedback_message_id_idx").on(table.messageId),
  }),
);

export const copilotEntitiesTable = pgTable(
  "copilot_entities",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    canonicalName: text("canonical_name").notNull(),
    aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
    asn: integer("asn"),
    prefixes: jsonb("prefixes").$type<string[]>().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    tenantEntityUq: uniqueIndex("copilot_entities_tenant_type_name_uq").on(
      table.tenantId,
      table.entityType,
      table.canonicalName,
    ),
    tenantIdx: index("copilot_entities_tenant_id_idx").on(table.tenantId),
  }),
);

export const copilotLearnedAliasesTable = pgTable(
  "copilot_learned_aliases",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").references(() => copilotEntitiesTable.id, { onDelete: "cascade" }),
    canonicalName: text("canonical_name"),
    confidence: real("confidence"),
    status: text("status").notNull().default("pending"),
    approvedBy: integer("approved_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    tenantAliasUq: uniqueIndex("copilot_learned_aliases_tenant_alias_uq").on(table.tenantId, table.alias),
    statusIdx: index("copilot_learned_aliases_status_idx").on(table.status),
  }),
);

export const copilotSkillsTable = pgTable(
  "copilot_skills",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    skillKey: text("skill_key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    intentPatterns: jsonb("intent_patterns").$type<string[]>().default([]),
    toolChain: jsonb("tool_chain").$type<string[]>().default([]),
    responseTemplate: text("response_template"),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    tenantSkillUq: uniqueIndex("copilot_skills_tenant_skill_key_uq").on(table.tenantId, table.skillKey),
    enabledIdx: index("copilot_skills_enabled_idx").on(table.enabled),
  }),
);

export const insertCopilotSessionSchema = createInsertSchema(copilotSessionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CopilotSession = typeof copilotSessionsTable.$inferSelect;
export type CopilotMessage = typeof copilotMessagesTable.$inferSelect;
export type CopilotToolRun = typeof copilotToolRunsTable.$inferSelect;
export type CopilotEntityRow = typeof copilotEntitiesTable.$inferSelect;
export type CopilotSkillRow = typeof copilotSkillsTable.$inferSelect;
export type InsertCopilotSession = z.infer<typeof insertCopilotSessionSchema>;
