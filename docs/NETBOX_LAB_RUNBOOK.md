# NetBox Lab Validation Runbook

**Version:** v0.3.7  
**Date:** 2026-05-23  
**Scope:** Read-only NetBox synchronization testing

---

## Prerequisites

### NetBox Lab Environment Required

- NetBox instance: lab.netops.internal (or external URL)
- API token: Generate in NetBox → Admin → Tokens
- Token permissions: READ only (critical)
- SSL certificate: Valid (or use NETBOX_SKIP_TLS_VERIFY=true for lab)

### Local Setup

```bash
# Clone/update codebase
git pull origin main

# Install dependencies
pnpm install

# Docker
docker-compose pull
docker-compose up -d
```

---

## Configuration (TAREFA 1)

### Environment Variables

Create `.env.lab` (NEVER commit NETBOX_TOKEN):

```bash
# NetBox Settings
NETBOX_ENABLED=true
NETBOX_URL=https://lab.netops.internal/api/
NETBOX_TOKEN=0123456789abcdef0123456789abcdef01234567
NETBOX_SKIP_TLS_VERIFY=false  # true only if lab has self-signed cert
NETBOX_TIMEOUT_MS=10000
NETBOX_PAGE_SIZE=100

# App settings
API_BASE_URL=http://127.0.0.1:8085
PORT=8085
LOG_LEVEL=info
```

### Launch with Config

```bash
# Load env and start
source .env.lab
docker-compose up -d

# Verify NetBox is reachable
curl -s -H "Authorization: Token $NETBOX_TOKEN" \
  "$NETBOX_URL/dcim/sites/" | jq '.count'
```

---

## Smoke Testing (TAREFA 2)

### Health Check

```bash
# API health
curl -s http://127.0.0.1:8085/api/healthz

# Expected: {"status":"ok"}
```

### NetBox Integration Status

```bash
# Endpoint: GET /api/netbox/status
curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8085/api/netbox/status | jq .

# Expected response:
{
  "enabled": true,
  "connected": true,
  "url": "https://lab.netops.internal/api/",
  "sitesCount": 5,
  "devicesCount": 23,
  "lastSyncedAt": "2026-05-23T10:00:00Z",
  "syncStatus": "idle"
}
```

### Test Connection

```bash
# Endpoint: POST /api/netbox/test-connection
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8085/api/netbox/test-connection | jq .

# Expected:
{
  "status": "ok",
  "url": "https://lab.netops.internal/api/",
  "apiVersion": "3.4",
  "authenticatedUser": "netops-api-user",
  "permissionLevel": "read-only",
  "latencyMs": 145
}
```

### List NetBox Sites

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8085/api/netbox/sites | jq .

# Expected: array of {id, name, slug, description}
```

### List NetBox Devices

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8085/api/netbox/devices | jq .

# Expected: array of {netboxId, name, deviceType, site, status, ...}
```

---

## Preview Sync (TAREFA 3)

### Request Preview

```bash
# Endpoint: POST /api/netbox/devices/preview-sync
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8085/api/netbox/devices/preview-sync | jq .
```

### Understand Preview Response

```json
{
  "summary": {
    "totalNetboxDevices": 23,
    "matchedByNetboxId": 15,
    "matchedByHostname": 5,
    "toCreate": 3,
    "toUpdate": 10,
    "toSkip": 5,
    "warnings": 2
  },
  "details": {
    "matched": [
      {
        "netboxId": 1,
        "netboxName": "router-1",
        "localId": 10,
        "localHostname": "router-1",
        "action": "update",
        "changes": ["site", "deviceType"]
      }
    ],
    "toCreate": [
      {
        "netboxId": 20,
        "name": "switch-5",
        "site": "NYC",
        "vendor": "juniper",
        "platform": "junos",
        "reason": "No local match"
      }
    ],
    "warnings": [
      {
        "netboxId": 21,
        "name": "firewall-1",
        "warning": "Hostname mismatch: NetBox='fw-prod-1', Local='firewall-old-name'"
      }
    ],
    "toSkip": [
      {
        "localId": 15,
        "hostname": "test-device-lab",
        "reason": "Local device with no NetBox match (lab device)"
      }
    ]
  }
}
```

### Review Preview

Before sync, review:

1. **Matched devices** — Should be >= 80% accuracy
2. **toCreate** — New devices from NetBox (validate names, sites)
3. **toUpdate** — Existing devices being updated (check what changes)
4. **Warnings** — Hostname mismatches, missing fields
5. **toSkip** — Local devices not in NetBox (should be lab/test devices)

**Abort if:**
- Matched count too low (< 60%)
- Unexpected warnings (vendor/platform mismatches)
- toCreate includes test/lab devices (filter first)

---

## Sync Local (TAREFA 4)

### Only After Successful Preview

```bash
# DO NOT run without previewing first
# DO NOT run if preview has warnings/issues

# Endpoint: POST /api/netbox/devices/sync-local
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8085/api/netbox/devices/sync-local \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}' | jq .
```

### Sync Response

```json
{
  "status": "completed",
  "summary": {
    "created": 3,
    "updated": 10,
    "skipped": 5,
    "failed": 0
  },
  "duration_ms": 2500,
  "audit_log_id": 9876,
  "changes": [
    {
      "device": "router-1",
      "action": "update",
      "fields": ["site", "deviceType"],
      "status": "success"
    }
  ]
}
```

### Verify Sync Results

```bash
# Check local device count increased
curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8085/api/devices | jq '.length'

# Verify no credentials overwritten
curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8085/api/devices/1 | jq '{id, hostname, passwordEncrypted}'

# Expected: passwordEncrypted should be preserved from before sync
```

---

## Validation Checklist

After sync, verify:

- [ ] Device count increased as expected
- [ ] New devices have correct site assignment
- [ ] Vendor/platform correctly mapped
- [ ] No passwords/credentials exposed
- [ ] Audit log shows netbox_sync event
- [ ] SSH/SNMP tests still work on existing devices
- [ ] No breaking changes to existing configs

---

## Rollback Procedure

If sync has issues:

```bash
# Export current state before attempting rollback
curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8085/api/devices/export?format=csv > devices_backup.csv

# Option 1: Manual fix in UI (recommended)
# Option 2: Restore from backup (requires full DB restore)
```

**Contact engineering if sync corruption detected.**

---

## Audit Logging

Verify audit trail:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8085/api/audit-logs?event=netbox_sync&limit=5" | jq .

# Expected events:
# - netbox_connection_test
# - netbox_preview_sync
# - netbox_devices_synced
```

---

## Troubleshooting

### Connection Fails

```
Error: "Failed to connect to NetBox"
Cause: URL unreachable, token invalid, firewall blocking
Fix:
  1. Test URL manually: curl -H "Authorization: Token $TOKEN" $NETBOX_URL/dcim/sites/
  2. Verify token permissions in NetBox admin
  3. Check firewall/VPN to lab network
  4. Verify NETBOX_SKIP_TLS_VERIFY=true if cert is self-signed
```

### Preview Shows Too Many Changes

```
Warning: Preview shows 50+ devices to create
Cause: Hostname mismatches, NetBox has staging devices
Fix:
  1. Review toCreate list for test/staging devices
  2. Filter manually before sync
  3. Ask NetBox admin to clean up staging devices
```

### Sync Hangs

```
Symptom: Sync takes > 5 minutes
Cause: Large device count (100+), network latency
Fix:
  1. Increase NETBOX_TIMEOUT_MS to 30000
  2. Reduce NETBOX_PAGE_SIZE to 50
  3. Run during low-traffic period
```

---

## Post-Sync Validation

### Run Smoke Tests

```bash
node tools/netbox-real-lab-selftest.mjs
# Expected: all tests pass
```

### Verify Device Operations

```bash
# Test connectivity on synced devices
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8085/api/devices/5/test-connectivity | jq .result

# Run discovery on sample synced device
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8085/api/devices/5/discovery | jq .status
```

---

## Next Steps

1. **Success:** Document maping in validation report
2. **Issues:** Log bugs, plan fixes
3. **Production:** Plan deployment timeline

---

**Status:** Ready for Lab Validation  
**Contact:** NetOps Team  
**Version:** v0.3.7
