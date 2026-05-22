# v0.2.3 NetBox Read-Only Validation

## Summary

Status: implemented and validated.

Mode validated: disabled/readiness mode. No real NetBox instance was configured in this environment.

## Implemented

- NetBox status endpoint.
- NetBox test connection endpoint.
- NetBox list endpoints.
- NetBox preview sync endpoint.
- NetBox sync-local endpoint for admin only.
- Local device mapping by `netbox_device_id` and hostname.
- Token-safe responses.
- Audit events.
- Frontend `/integrations` NetBox controls.

## Security

- No NetBox write endpoint implemented.
- `NETBOX_TOKEN` read from env only.
- API never returns token.
- Frontend only sees `tokenConfigured`.
- Sync-local never overwrites `password_encrypted`.
- Sync-local never overwrites `snmp_community`.

## Validation

Executed:
- `GET /api/netbox/status` -> `200`, `enabled=false`, `readiness=disabled`
- `POST /api/netbox/test-connection` -> `200`, `status=disabled`
- `GET /api/netbox/devices` -> `503` JSON error, NetBox disabled
- `POST /api/netbox/devices/preview-sync` -> `503` JSON error, NetBox disabled
- `tools/netbox-readonly-selftest.mjs` -> pass
- viewer cannot run sync-local
- operator cannot run sync-local
- preview disabled mode does not change local devices
- audit includes `netbox_test_connection`

Source validation:
- API typecheck: pass
- frontend typecheck: pass
- workspace build: pass
- OpenAPI/Orval codegen: pass
- Docker rebuild api/web: pass

## Risk

- Real NetBox not tested because env does not provide `NETBOX_ENABLED=true`, `NETBOX_URL`, and `NETBOX_TOKEN`.
- Sync is local DB only.
- Tenant/site/role IDs beyond `netbox_device_id` are documented but not persisted in dedicated columns yet.
