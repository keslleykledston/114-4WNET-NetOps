# NetBox Security Model

## Read-Only Contract

The API only uses NetBox `GET` endpoints:
- `/api/status/`
- `/api/dcim/devices/`
- `/api/dcim/sites/`
- `/api/tenancy/tenants/`
- `/api/dcim/device-roles/`
- `/api/dcim/manufacturers/`
- `/api/dcim/platforms/`

No NetBox write method is implemented.

## Token Handling

- token comes from `NETBOX_TOKEN`
- token is never stored in `integration_settings`
- token is never returned in API payloads
- frontend can only see `tokenConfigured: true|false`
- audit metadata only records token presence

## TLS

`NETBOX_SKIP_TLS_VERIFY=false` by default.

TLS skip is intended for lab/self-signed NetBox only.

## Local Sync

Local sync writes only to NetOps database. It never writes to NetBox and never writes to network devices.
