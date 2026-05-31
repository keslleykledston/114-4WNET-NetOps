import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const templateDraftsTable = pgTable("template_drafts", {
  id: serial("id").primaryKey(),
  templateId: serial("template_id"),
  version: text("version").notNull().default("0.0.1"),
  draftBody: text("draft_body").notNull(),
  status: text("status").notNull().default("DRAFT"),
  createdBy: text("created_by").notNull(),
  approvedBy: text("approved_by"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const templateValidationResultsTable = pgTable("template_validation_results", {
  id: serial("id").primaryKey(),
  draftId: serial("draft_id").notNull(),
  passed: boolean("passed").notNull(),
  errorsJson: text("errors_json"),
  warningsJson: text("warnings_json"),
  validatedBy: text("validated_by"),
  validatedAt: timestamp("validated_at").defaultNow(),
});

export const templateCompilerLogsTable = pgTable("template_compiler_logs", {
  id: serial("id").primaryKey(),
  draftId: serial("draft_id"),
  operation: text("operation").notNull(),
  inputDsl: text("input_dsl"),
  outputCli: text("output_cli"),
  errorsJson: text("errors_json"),
  actor: text("actor"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTemplateDraftSchema = createInsertSchema(templateDraftsTable);
export const insertTemplateValidationResultSchema = createInsertSchema(templateValidationResultsTable);
export const insertTemplateCompilerLogSchema = createInsertSchema(templateCompilerLogsTable);

export type TemplateDraft = typeof templateDraftsTable.$inferSelect;
export type InsertTemplateDraft = z.infer<typeof insertTemplateDraftSchema>;
export type TemplateValidationResult = typeof templateValidationResultsTable.$inferSelect;
export type InsertTemplateValidationResult = z.infer<typeof insertTemplateValidationResultSchema>;
export type TemplateCompilerLog = typeof templateCompilerLogsTable.$inferSelect;
export type InsertTemplateCompilerLog = z.infer<typeof insertTemplateCompilerLogSchema>;
