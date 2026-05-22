import { index, pgTable, serial, text, boolean, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export const integrationSettingsTable = pgTable("integration_settings", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  readiness: text("readiness").notNull().default("future"),
  lastConnectionStatus: text("last_connection_status"),
  lastConnectionAt: timestamp("last_connection_at"),
  configJson: jsonb("config_json").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  nameUq: uniqueIndex("integration_settings_name_uq").on(table.name),
  enabledIdx: index("integration_settings_enabled_idx").on(table.enabled),
}));
