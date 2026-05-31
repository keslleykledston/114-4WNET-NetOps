import { and, desc, eq } from "drizzle-orm";
import {
  alertNotificationsTable,
  db,
  tenantNotificationSettingsTable,
  tenantsTable,
} from "@workspace/db";
import { decrypt, encrypt } from "../../lib/crypto.js";
import { logAuditEvent } from "../../lib/audit.js";
import { getRequestContext } from "../../lib/request-context.js";
import type { ConnectorAlertSeverity, ConnectorAlertType } from "../connectors/connector-health.types.js";

export const NOTIFICATION_ALERT_TYPES: ConnectorAlertType[] = [
  "CONNECTOR_OFFLINE",
  "WIREGUARD_STALE_HANDSHAKE",
  "JOBS_FAILING",
  "CONFIG_PARSE_FAILED",
  "BGP_PARSE_FAILED",
  "L2_PARSE_FAILED",
];

export const NOTIFICATION_CHANNELS = ["TELEGRAM", "WEBHOOK", "EMAIL"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED" | "RATE_LIMITED";

type NotificationSettingsRow = typeof tenantNotificationSettingsTable.$inferSelect;

export type TenantNotificationSettingsView = {
  tenant_id: number;
  tenant_name?: string;
  telegram_bot_token_configured: boolean;
  telegram_chat_id: string | null;
  webhook_url: string | null;
  email_enabled: boolean;
  email_recipients: string | null;
  created_at: string;
  updated_at: string;
};

export type AlertNotificationView = {
  id: number;
  tenant_id: number;
  tenant_name?: string | null;
  connector_id: number | null;
  device_id: number | null;
  alert_type: string;
  severity: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  title: string;
  message: string;
  destination: string | null;
  dedupe_key: string;
  payload_json: Record<string, unknown>;
  provider_message_id: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantNotificationSettingsInput = {
  telegram_bot_token?: string | null;
  telegram_chat_id?: string | null;
  webhook_url?: string | null;
  email_enabled?: boolean;
  email_recipients?: string | null;
};

const RATE_LIMIT_WINDOW_MS = 30 * 60 * 1000;

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function encodeTelegramToken(token: string | null | undefined): string | null {
  const normalized = normalizeText(token);
  if (!normalized) return null;
  return encrypt(normalized);
}

function decodeTelegramToken(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    return null;
  }
}

function toSettingsView(row: NotificationSettingsRow & { tenantName?: string }): TenantNotificationSettingsView {
  return {
    tenant_id: row.tenantId,
    tenant_name: row.tenantName,
    telegram_bot_token_configured: Boolean(row.telegramBotTokenEnc),
    telegram_chat_id: row.telegramChatId,
    webhook_url: row.webhookUrl,
    email_enabled: row.emailEnabled,
    email_recipients: row.emailRecipients,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function toNotificationView(row: typeof alertNotificationsTable.$inferSelect & { tenantName?: string | null }): AlertNotificationView {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    tenant_name: row.tenantName ?? null,
    connector_id: row.connectorId ?? null,
    device_id: row.deviceId ?? null,
    alert_type: row.alertType,
    severity: row.severity,
    channel: row.channel as NotificationChannel,
    status: row.status as NotificationStatus,
    title: row.title,
    message: row.message,
    destination: row.destination,
    dedupe_key: row.dedupeKey,
    payload_json: row.payloadJson ?? {},
    provider_message_id: row.providerMessageId,
    error: row.error,
    sent_at: row.sentAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function buildDedupeKey(input: {
  tenantId: number;
  connectorId: number | null;
  deviceId: number | null;
  alertType: string;
  channel: NotificationChannel;
}) {
  return `${input.tenantId}:${input.connectorId ?? "null"}:${input.deviceId ?? "null"}:${input.alertType}:${input.channel}`;
}

async function getLatestByDedupeKey(dedupeKey: string) {
  const [row] = await db
    .select()
    .from(alertNotificationsTable)
    .where(eq(alertNotificationsTable.dedupeKey, dedupeKey))
    .orderBy(desc(alertNotificationsTable.createdAt))
    .limit(1);
  return row ?? null;
}

async function insertNotificationAttempt(input: {
  tenantId: number;
  connectorId: number | null;
  deviceId: number | null;
  alertType: string;
  severity: ConnectorAlertSeverity;
  channel: NotificationChannel;
  status: NotificationStatus;
  title: string;
  message: string;
  destination: string | null;
  dedupeKey: string;
  payloadJson: Record<string, unknown>;
  providerMessageId?: string | null;
  error?: string | null;
  sentAt?: Date | null;
}) {
  const now = new Date();
  const [inserted] = await db
    .insert(alertNotificationsTable)
    .values({
      tenantId: input.tenantId,
      connectorId: input.connectorId,
      deviceId: input.deviceId,
      alertType: input.alertType,
      severity: input.severity,
      channel: input.channel,
      status: input.status,
      title: input.title,
      message: input.message,
      destination: input.destination,
      dedupeKey: input.dedupeKey,
      payloadJson: input.payloadJson,
      providerMessageId: input.providerMessageId ?? null,
      error: input.error ?? null,
      sentAt: input.sentAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return inserted ?? null;
}

async function shouldRateLimit(dedupeKey: string): Promise<boolean> {
  const latest = await getLatestByDedupeKey(dedupeKey);
  if (!latest) return false;
  return Date.now() - latest.createdAt.getTime() < RATE_LIMIT_WINDOW_MS;
}

export async function getTenantNotificationSettings(tenantId: number): Promise<TenantNotificationSettingsView | null> {
  const [row] = await db
    .select({ settings: tenantNotificationSettingsTable, tenantName: tenantsTable.name })
    .from(tenantNotificationSettingsTable)
    .innerJoin(tenantsTable, eq(tenantNotificationSettingsTable.tenantId, tenantsTable.id))
    .where(eq(tenantNotificationSettingsTable.tenantId, tenantId))
    .limit(1);
  if (!row) return null;
  return toSettingsView({ ...row.settings, tenantName: row.tenantName });
}

export async function listTenantNotificationSettings(): Promise<TenantNotificationSettingsView[]> {
  const rows = await db
    .select({ settings: tenantNotificationSettingsTable, tenantName: tenantsTable.name })
    .from(tenantNotificationSettingsTable)
    .innerJoin(tenantsTable, eq(tenantNotificationSettingsTable.tenantId, tenantsTable.id))
    .orderBy(desc(tenantNotificationSettingsTable.updatedAt));
  return rows.map((row) => toSettingsView({ ...row.settings, tenantName: row.tenantName }));
}

export async function upsertTenantNotificationSettings(
  tenantId: number,
  input: TenantNotificationSettingsInput,
): Promise<TenantNotificationSettingsView> {
  const now = new Date();
  const [existing] = await db
    .select()
    .from(tenantNotificationSettingsTable)
    .where(eq(tenantNotificationSettingsTable.tenantId, tenantId))
    .limit(1);

  const patch = {
    tenantId,
    telegramBotTokenEnc:
      input.telegram_bot_token === undefined
        ? existing?.telegramBotTokenEnc ?? null
        : encodeTelegramToken(input.telegram_bot_token),
    telegramChatId:
      input.telegram_chat_id === undefined
        ? existing?.telegramChatId ?? null
        : normalizeText(input.telegram_chat_id),
    webhookUrl:
      input.webhook_url === undefined ? existing?.webhookUrl ?? null : normalizeText(input.webhook_url),
    emailEnabled: input.email_enabled ?? existing?.emailEnabled ?? false,
    emailRecipients:
      input.email_recipients === undefined
        ? existing?.emailRecipients ?? null
        : normalizeText(input.email_recipients),
    updatedAt: now,
    createdAt: existing?.createdAt ?? now,
  };

  if (existing) {
    const [updated] = await db
      .update(tenantNotificationSettingsTable)
      .set(patch)
      .where(eq(tenantNotificationSettingsTable.tenantId, tenantId))
      .returning();
    await logAuditEvent({
      actorId: getRequestContext()?.user?.id ?? null,
      action: "tenant_notification_settings_updated",
      objectType: "tenant_notification_settings",
      objectId: String(tenantId),
      metadata: {
        tenant_id: tenantId,
        telegram_bot_token_configured: Boolean(updated?.telegramBotTokenEnc),
        telegram_chat_id: Boolean(updated?.telegramChatId),
        webhook_url: Boolean(updated?.webhookUrl),
        email_enabled: updated?.emailEnabled ?? false,
      },
    });
    return toSettingsView({ ...(updated ?? existing), tenantName: undefined });
  }

  const [created] = await db.insert(tenantNotificationSettingsTable).values(patch).returning();
  await logAuditEvent({
    actorId: getRequestContext()?.user?.id ?? null,
    action: "tenant_notification_settings_created",
    objectType: "tenant_notification_settings",
    objectId: String(tenantId),
    metadata: {
      tenant_id: tenantId,
      telegram_bot_token_configured: Boolean(created?.telegramBotTokenEnc),
      telegram_chat_id: Boolean(created?.telegramChatId),
      webhook_url: Boolean(created?.webhookUrl),
      email_enabled: created?.emailEnabled ?? false,
    },
  });
  return toSettingsView({ ...(created ?? patch), tenantName: undefined });
}

export async function listAlertNotifications(filters?: { tenantId?: number; limit?: number }) {
  const conditions = [];
  if (filters?.tenantId) {
    conditions.push(eq(alertNotificationsTable.tenantId, filters.tenantId));
  }

  const rows = await db
    .select({ notification: alertNotificationsTable, tenantName: tenantsTable.name })
    .from(alertNotificationsTable)
    .innerJoin(tenantsTable, eq(alertNotificationsTable.tenantId, tenantsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(alertNotificationsTable.createdAt))
    .limit(filters?.limit ?? 200);

  return rows.map((row) => toNotificationView({ ...row.notification, tenantName: row.tenantName }));
}

async function sendTelegramNotification(input: {
  token: string;
  chatId: string;
  text: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`https://api.telegram.org/bot${input.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: input.chatId,
        text: input.text,
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => null)) as { description?: string; result?: { message_id?: number | string } } | null;
    if (!response.ok) {
      throw new Error(data?.description ?? `Telegram error (${response.status})`);
    }
    return String(data?.result?.message_id ?? "");
  } finally {
    clearTimeout(timeout);
  }
}

async function sendWebhookNotification(input: { url: string; payload: Record<string, unknown> }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(input.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.payload),
      signal: controller.signal,
    });
    const body = await response.text().catch(() => "");
    if (!response.ok) {
      throw new Error(body || `Webhook error (${response.status})`);
    }
    return body.slice(0, 120) || null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildTelegramMessage(input: {
  tenantId: number;
  connectorId: number | null;
  connectorName: string | null;
  deviceId: number | null;
  alertType: string;
  severity: ConnectorAlertSeverity;
  title: string;
  message: string;
}) {
  const lines = [
    `[${input.severity}] ${input.alertType}`,
    input.title,
    input.message,
    `tenant_id=${input.tenantId}`,
  ];
  if (input.connectorId != null) lines.push(`connector_id=${input.connectorId}`);
  if (input.connectorName) lines.push(`connector=${input.connectorName}`);
  if (input.deviceId != null) lines.push(`device_id=${input.deviceId}`);
  return lines.join("\n");
}

export async function dispatchAlertNotifications(input: {
  tenantId: number;
  connectorId?: number | null;
  connectorName?: string | null;
  deviceId?: number | null;
  alertType: ConnectorAlertType;
  severity: ConnectorAlertSeverity;
  title: string;
  message: string;
  payload?: Record<string, unknown>;
}) {
  if (!NOTIFICATION_ALERT_TYPES.includes(input.alertType)) {
    return { sent: 0, skipped: 0, failed: 0 };
  }

  const settings = await db
    .select()
    .from(tenantNotificationSettingsTable)
    .where(eq(tenantNotificationSettingsTable.tenantId, input.tenantId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!settings) {
    return { sent: 0, skipped: 0, failed: 0 };
  }

  const payload = {
    alert_type: input.alertType,
    severity: input.severity,
    title: input.title,
    message: input.message,
    tenant_id: input.tenantId,
    connector_id: input.connectorId ?? null,
    device_id: input.deviceId ?? null,
    created_at: new Date().toISOString(),
    ...(input.payload ?? {}),
  };

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  const channels: Array<{
    channel: NotificationChannel;
    configured: boolean;
    destination: string | null;
    send: () => Promise<string | null>;
  }> = [];

  const telegramToken = decodeTelegramToken(settings.telegramBotTokenEnc);
  if (telegramToken && settings.telegramChatId) {
    channels.push({
      channel: "TELEGRAM",
      configured: true,
      destination: settings.telegramChatId,
      send: async () =>
        sendTelegramNotification({
          token: telegramToken,
          chatId: settings.telegramChatId ?? "",
          text: buildTelegramMessage({
            tenantId: input.tenantId,
            connectorId: input.connectorId ?? null,
            connectorName: input.connectorName ?? null,
            deviceId: input.deviceId ?? null,
            alertType: input.alertType,
            severity: input.severity,
            title: input.title,
            message: input.message,
          }),
        }),
    });
  }

  if (settings.webhookUrl) {
    channels.push({
      channel: "WEBHOOK",
      configured: true,
      destination: settings.webhookUrl,
      send: async () => sendWebhookNotification({ url: settings.webhookUrl ?? "", payload }),
    });
  }

  if (settings.emailEnabled && settings.emailRecipients) {
    channels.push({
      channel: "EMAIL",
      configured: true,
      destination: settings.emailRecipients,
      send: async () => {
        throw new Error("EMAIL_NOT_IMPLEMENTED");
      },
    });
  }

  for (const entry of channels) {
    const dedupeKey = buildDedupeKey({
      tenantId: input.tenantId,
      connectorId: input.connectorId ?? null,
      deviceId: input.deviceId ?? null,
      alertType: input.alertType,
      channel: entry.channel,
    });

    if (await shouldRateLimit(dedupeKey)) {
      await insertNotificationAttempt({
        tenantId: input.tenantId,
        connectorId: input.connectorId ?? null,
        deviceId: input.deviceId ?? null,
        alertType: input.alertType,
        severity: input.severity,
        channel: entry.channel,
        status: "RATE_LIMITED",
        title: input.title,
        message: input.message,
        destination: entry.destination,
        dedupeKey,
        payloadJson: payload,
        error: "Rate limited for 30 minutes",
      });
      skipped += 1;
      continue;
    }

    try {
      const providerMessageId = await entry.send();
      await insertNotificationAttempt({
        tenantId: input.tenantId,
        connectorId: input.connectorId ?? null,
        deviceId: input.deviceId ?? null,
        alertType: input.alertType,
        severity: input.severity,
        channel: entry.channel,
        status: "SENT",
        title: input.title,
        message: input.message,
        destination: entry.destination,
        dedupeKey,
        payloadJson: payload,
        providerMessageId,
        sentAt: new Date(),
      });
      sent += 1;
    } catch (error) {
      await insertNotificationAttempt({
        tenantId: input.tenantId,
        connectorId: input.connectorId ?? null,
        deviceId: input.deviceId ?? null,
        alertType: input.alertType,
        severity: input.severity,
        channel: entry.channel,
        status: "FAILED",
        title: input.title,
        message: input.message,
        destination: entry.destination,
        dedupeKey,
        payloadJson: payload,
        error: error instanceof Error ? error.message : "Notification failed",
      });
      failed += 1;
    }
  }

  return { sent, skipped, failed };
}
