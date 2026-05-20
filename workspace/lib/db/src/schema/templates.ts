import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const configTemplatesTable = pgTable("config_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull(),
  vendor: text("vendor").notNull(),
  platform: text("platform").notNull(),
  template: text("template").notNull(),
  parameters: text("parameters"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertConfigTemplateSchema = createInsertSchema(configTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertConfigTemplate = z.infer<typeof insertConfigTemplateSchema>;
export type ConfigTemplate = typeof configTemplatesTable.$inferSelect;
