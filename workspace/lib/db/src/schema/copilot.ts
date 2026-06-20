import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const copilotSessionsTable = pgTable("copilot_sessions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  userId: integer("user_id").notNull(),
  title: text("title"),
  anchorDeviceId: integer("anchor_device_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const copilotMessagesTable = pgTable("copilot_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const copilotToolRunsTable = pgTable("copilot_tool_runs", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  messageId: integer("message_id").notNull(),
  toolName: text("tool_name").notNull(),
  inputJson: jsonb("input_json").notNull().$type<Record<string, unknown>>(),
  outputJson: jsonb("output_json").notNull().$type<Record<string, unknown>>(),
  status: text("status").notNull(),
  durationMs: integer("duration_ms").notNull(),
  sourceType: text("source_type"),
  sourceRef: text("source_ref"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const copilotFeedbackTable = pgTable("copilot_feedback", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull(),
  userId: integer("user_id").notNull(),
  rating: text("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const copilotEntitiesTable = pgTable("copilot_entities", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  entityType: text("entity_type").notNull(),
  canonicalName: text("canonical_name").notNull(),
  aliases: jsonb("aliases").$type<string[]>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  asn: integer("asn"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const copilotLearnedAliasesTable = pgTable("copilot_learned_aliases", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  alias: text("alias").notNull(),
  entityId: integer("entity_id"),
  canonicalName: text("canonical_name"),
  entityType: text("entity_type").notNull(),
  confidence: integer("confidence"),
  status: text("status").notNull().default("pending"),
  approvedBy: integer("approved_by"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const copilotSkillsTable = pgTable("copilot_skills", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  skillKey: text("skill_key").notNull(),
  name: text("name").notNull().default(""),
  description: text("description").notNull().default(""),
  toolChain: jsonb("tool_chain").$type<string[]>(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
