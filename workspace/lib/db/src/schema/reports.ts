import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { provisioningJobsTable } from "./provisioning";

export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  provisioningJobId: integer("provisioning_job_id").notNull().references(() => provisioningJobsTable.id, { onDelete: "cascade" }),
  reportType: text("report_type").notNull().default("markdown"),
  contentMarkdown: text("content_markdown").notNull(),
  generatedBy: text("generated_by"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
}, (table) => ({
  provisioningJobIdIdx: index("reports_provisioning_job_id_idx").on(table.provisioningJobId),
  generatedAtIdx: index("reports_generated_at_idx").on(table.generatedAt),
}));

