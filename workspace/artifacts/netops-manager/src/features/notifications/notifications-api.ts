async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
  return data as T;
}

export type TenantNotificationSettings = {
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

export type AlertNotification = {
  id: number;
  tenant_id: number;
  tenant_name?: string | null;
  connector_id: number | null;
  device_id: number | null;
  alert_type: string;
  severity: string;
  channel: "TELEGRAM" | "WEBHOOK" | "EMAIL";
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED" | "RATE_LIMITED";
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

export function listTenantNotifications() {
  return apiFetch<TenantNotificationSettings[]>("/api/tenant-notifications");
}

export function getTenantNotifications(tenantId: number) {
  return apiFetch<TenantNotificationSettings>(`/api/tenants/${tenantId}/notifications`);
}

export function updateTenantNotifications(
  tenantId: number,
  input: {
    telegram_bot_token?: string | null;
    telegram_chat_id?: string | null;
    webhook_url?: string | null;
    email_enabled?: boolean;
    email_recipients?: string | null;
  },
) {
  return apiFetch<TenantNotificationSettings>(`/api/tenants/${tenantId}/notifications`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function listAlertNotifications(tenantId?: number) {
  const search = tenantId ? `?tenant_id=${tenantId}` : "";
  return apiFetch<AlertNotification[]>(`/api/alert-notifications${search}`);
}
