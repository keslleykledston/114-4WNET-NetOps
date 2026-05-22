# Integrations Readiness

## Table

`integration_settings`

## Preseeded Integrations

- `netbox`
- `future_webhook`
- `future_zabbix`

## Rules

- NetBox is read-only against NetBox.
- local sync writes only into NetOps local DB.
- no NetBox write operation exists.
- no token exposure in the UI.
- no plaintext secrets from the frontend.
- `NETBOX_TOKEN` is read from environment only.

## NetBox Status Fields

- `enabled`
- `baseUrlConfigured`
- `tokenConfigured`
- `skipTlsVerify`
- `lastConnectionStatus`
- `lastConnectionAt`
- `readiness`
