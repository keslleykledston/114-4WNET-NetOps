# NetBox Read-Only Sync

## Scope

NetBox integration is read-only against NetBox.

Allowed:
- test connection
- list devices, sites, tenants, roles, manufacturers, platforms
- preview local device import/update
- sync NetBox inventory into local database

Blocked:
- create/update/delete objects in NetBox
- write credentials to NetBox
- network device changes
- apply or rollback config

## Environment

- `NETBOX_ENABLED=false`
- `NETBOX_URL=`
- `NETBOX_TOKEN=`
- `NETBOX_SKIP_TLS_VERIFY=false`
- `NETBOX_TIMEOUT_MS=10000`
- `NETBOX_PAGE_SIZE=100`

`NETBOX_TOKEN` is read from environment only. It is not accepted from frontend and is never returned by API.

## RBAC

- viewer: `GET /api/netbox/status`
- operator: status, test connection, list, preview
- admin: sync local

## Sync Behavior

Preview does not modify local database.

Sync local:
- creates local devices from NetBox devices with primary IP
- updates local devices matched by `netbox_device_id` or hostname
- never overwrites local `password_encrypted`
- never overwrites local `snmp_community`
- preserves local connectivity status
- writes audit events

## Audit

Events:
- `netbox_test_connection`
- `netbox_preview_sync`
- `netbox_sync_started`
- `netbox_sync_completed`
- `netbox_sync_failed`

Metadata is sanitized and does not contain token values.
