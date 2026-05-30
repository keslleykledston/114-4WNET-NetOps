# Post-SSH Auto Collect

## Trigger

`POST /api/devices/:id/test-connection` or `POST /api/devices/:id/test-connectivity` when:

1. Device has `connector_id`
2. SSH probe (`display version`) succeeds

## Service

`enqueuePostSshSuccessCollections()` in `connector-auto-collect.service.ts`

### Always enqueued

- **SSH_CONFIG_BUNDLE** — full read-only config/operational dump via connector job queue

### Conditionally enqueued

- **SNMP_FAST** — when `device.snmpCommunity` is set; runs asynchronously via `collectSnmpFastInterfaces()` without blocking the SSH test response

## Response shape

```json
{
  "success": true,
  "message": "SSH OK — bundle enfileirado · SNMP_FAST enfileirado",
  "configCollect": {
    "correlationId": "uuid",
    "sshConfigBundle": { "status": "queued", "jobId": 123 },
    "snmpFast": { "status": "queued" }
  }
}
```

When SNMP is not configured:

```json
"snmpFast": { "status": "skipped", "message": "SNMP community not configured" }
```

## Non-blocking design

The SSH test returns immediately after the quick probe. Bundle collection, SNMP walk, and parsing run in background jobs / `setImmediate` callbacks.

## Audit

Actions logged:

- `connector_post_ssh_autocollect`
- `connector_config_bundle_enqueued`
- `connector_snmp_fast_autocollect` / `_failed`
- `device_config_collected_via_connector`
- `device_config_bundle_parsed`

## UI messages

| State | Toast / status |
|-------|----------------|
| SSH OK + bundle queued | "SSH OK — coleta completa enfileirada" |
| SNMP queued | "SNMP_FAST enfileirado" |
| Bundle enqueue failed | Warning toast, SSH still OK |
| Parse pending | Device detail card shows `PENDING` |

## Secrets

Passwords and SNMP communities are never returned in API responses. Job payloads use `masked_payload_json` with `[redacted]` placeholders.
