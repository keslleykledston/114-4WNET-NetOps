import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { connectorsTable, tenantsTable } from "./connectors.js";
import { devicesTable } from "./devices.js";

export const tenantNotificationSettingsTable = pgTable(
  "tenant_notification_settings",
  {
    tenantId: integer("tenant_id")
      .primaryKey()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    telegramBotTokenEnc: text("telegram_bot_token_enc"),
    telegramChatId: text("telegram_chat_id"),
    webhookUrl: text("webhook_url"),
    emailEnabled: boolean("email_enabled").notNull().default(false),
    emailRecipients: text("email_recipients"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    tenantUq: uniqueIndex("tenant_notification_settings_tenant_uq").on(table.tenantId),
  }),
);

export const alertNotificationsTable = pgTable(
  "alert_notifications",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    connectorId: integer("connector_id").references(() => connectorsTable.id, { onDelete: "set null" }),
    deviceId: integer("device_id").references(() => devicesTable.id, { onDelete: "set null" }),
    alertType: text("alert_type").notNull(),
    severity: text("severity").notNull(),
    channel: text("channel").notNull(),
    status: text("status").notNull().default("PENDING"),
    title: text("title").notNull(),
    message: text("message").notNull(),
    destination: text("destination"),
    dedupeKey: text("dedupe_key").notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull().default({}),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    tenantCreatedIdx: index("alert_notifications_tenant_created_idx").on(table.tenantId, table.createdAt),
    tenantTypeIdx: index("alert_notifications_tenant_type_idx").on(table.tenantId, table.alertType),
    dedupeIdx: index("alert_notifications_dedupe_idx").on(table.dedupeKey, table.createdAt),
    statusIdx: index("alert_notifications_status_idx").on(table.status),
  }),
);

export type TenantNotificationSettings = typeof tenantNotificationSettingsTable.$inferSelect;
export type AlertNotification = typeof alertNotificationsTable.$inferSelect;
