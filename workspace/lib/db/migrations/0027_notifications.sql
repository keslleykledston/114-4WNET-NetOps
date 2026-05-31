CREATE TABLE IF NOT EXISTS tenant_notification_settings (
  tenant_id integer PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  telegram_bot_token_enc text,
  telegram_chat_id text,
  webhook_url text,
  email_enabled boolean NOT NULL DEFAULT false,
  email_recipients text,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_notification_settings_tenant_uq
  ON tenant_notification_settings (tenant_id);

CREATE TABLE IF NOT EXISTS alert_notifications (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connector_id integer REFERENCES connectors(id) ON DELETE SET NULL,
  device_id integer REFERENCES devices(id) ON DELETE SET NULL,
  alert_type text NOT NULL,
  severity text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  title text NOT NULL,
  message text NOT NULL,
  destination text,
  dedupe_key text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_message_id text,
  error text,
  sent_at timestamp,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS alert_notifications_tenant_created_idx
  ON alert_notifications (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS alert_notifications_tenant_type_idx
  ON alert_notifications (tenant_id, alert_type);

CREATE INDEX IF NOT EXISTS alert_notifications_dedupe_idx
  ON alert_notifications (dedupe_key, created_at);

CREATE INDEX IF NOT EXISTS alert_notifications_status_idx
  ON alert_notifications (status);
