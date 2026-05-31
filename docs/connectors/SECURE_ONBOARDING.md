# Secure Connector Onboarding — Phase 8.1

## Overview

The connector bootstrap process now uses a **one-shot, time-limited token delivery system** to minimize secret exposure. The raw `connector_token` is never returned in API responses and only delivered via a dedicated download endpoint.

## Security Features

- ✅ Token generated **only on demand**, not during connector creation
- ✅ Token **expires in 15 minutes** by default
- ✅ Token delivery **audited and logged**
- ✅ Token can only be **delivered once per issue**
- ✅ Raw token **never appears in API responses**
- ✅ Token automatically marked **used after first heartbeat**
- ✅ Re-issuance blocked unless explicitly authorized

---

## Workflow

### 1. Create Connector

**Admin or Operator creates the connector. No token is returned yet.**

```bash
curl -X POST http://localhost:8085/api/connectors \
  -H "Content-Type: application/json" \
  -H "Cookie: session=..." \
  -d '{
    "tenant_id": 1,
    "name": "site-a-connector-01",
    "description": "Production connector for Site A",
    "wireguard_ip": "10.255.0.100",
    "networks": [
      { "network_cidr": "10.0.0.0/8", "description": "Site A LAN" }
    ]
  }'
```

**Response:**
```json
{
  "id": 42,
  "name": "site-a-connector-01",
  "status": "PENDING",
  "bootstrap_pending": true,
  "wireguard_config_preview": "[Interface]\n...",
  "tenant_id": 1,
  "tenant_name": "Acme Inc.",
  ...
}
```

**No `connector_token` in response.** Status is `PENDING` and requires bootstrap.

---

### 2. Generate Bootstrap Package

**Only Admin can issue bootstrap tokens.** Each issuance is logged for audit.

```bash
curl -X POST http://localhost:8085/api/connectors/42/bootstrap-package \
  -H "Cookie: session=..." \
  -o site-a-connector-01.env
```

**This endpoint:**
- Generates a fresh token (16-byte random, base64url-encoded)
- Stores token hash in `connector_bootstrap_tokens` table
- Sets `connector_token_hash` on the connector
- Creates TTL: 15 minutes from generation
- Returns `.env` file for download
- **Never logs the raw token**
- Records audit event: `connector_bootstrap_issued`

**Response:** HTTP 200, `Content-Type: text/plain`, file download.

**File content (`site-a-connector-01.env`):**
```bash
# NetOps Connector Bootstrap Package
# Generated at: 2026-05-31T03:15:00Z
# TTL: 15 minutes from generation
# WARNING: Keep this token secure. This file should be sourced into the connector agent environment.

export CONNECTOR_TOKEN="nc_h7x9mK2...9z4wPa=="
export CONNECTOR_ID="42"
export CONNECTOR_NAME="site-a-connector-01"

# WireGuard Configuration
cat > /tmp/wg-connector.conf <<'WGEOF'
[Interface]
Address = 10.255.0.100/32
PrivateKey = ...
[Peer]
PublicKey = ...
Endpoint = vpn.netops.com:51820
AllowedIPs = 10.0.0.0/8,192.168.0.0/16
WGEOF
```

---

### 3. Deploy and Activate

**Operator sources the `.env` file and starts the connector agent.**

```bash
# On the connector host (e.g., Docker container, bare VM, Kubernetes pod)
source site-a-connector-01.env
docker run -e CONNECTOR_TOKEN -e CONNECTOR_ID -e CONNECTOR_NAME \
  -v /tmp/wg-connector.conf:/etc/wireguard/wg-connector.conf \
  netops/connector-agent:latest
```

**Agent startup:**
1. Reads `CONNECTOR_TOKEN` from env
2. Attempts first heartbeat: `POST /api/connectors/heartbeat` with bearer token
3. On success:
   - Connector status changes to `ONLINE`
   - Bootstrap token marked as `used_at = NOW()`
   - Token continues to work for future heartbeats (same token, same hash)

---

### 4. Token Lifecycle

| Event | State | Can Auth? | Notes |
|-------|-------|-----------|-------|
| **Generated** | `token_hash` set, `expires_at=now+15min`, `used_at=NULL` | ✅ Yes | Fresh token, valid for 15 min |
| **First heartbeat** | `used_at=now`, still valid | ✅ Yes | Token marked used, continues to work |
| **Expired** | `expires_at < now` | ❌ No | Connector auth fails |
| **Re-issued** (rotate) | Old: `revoked_at=now`. New: fresh token | ✅ Yes (new token) | Old token invalid, audit logged |

---

### 5. Re-Issue (Rotate Token)

**Only Admin can rotate. Blocking unless explicitly rotated.**

If someone tries to download bootstrap twice:

```bash
curl -X POST http://localhost:8085/api/connectors/42/bootstrap-package \
  -H "Cookie: session=..."
```

**Response (409 Conflict):**
```json
{
  "error": "Active bootstrap token already exists. Use ?rotate=true to reissue."
}
```

To rotate:

```bash
curl -X POST "http://localhost:8085/api/connectors/42/bootstrap-package?rotate=true" \
  -H "Cookie: session=..." \
  -o site-a-connector-01-new.env
```

This revokes the old token and generates a new one.

---

## Integration with UI

### Connector Creation Flow (React)

1. **Form submission → `POST /api/connectors`**
   - User enters: tenant, name, description, WireGuard settings
   - API returns: connector details + `bootstrap_pending: true`
   - No token displayed in UI

2. **Post-creation card: "PENDING BOOTSTRAP"**
   - Shows connector ID, name, status
   - Button: "📥 Baixar pacote de bootstrap"
   - Warning: "Este segredo será baixado apenas uma vez"

3. **Download click → `POST /connectors/:id/bootstrap-package`**
   - Browser downloads `.env` file
   - Card transitions to green checkmark
   - "✓ Pacote baixado — Use arquivo para inicializar o agente"

4. **User deploys agent with `.env`**
   - Agent starts, reads `CONNECTOR_TOKEN`, sends heartbeat
   - NetOps API marks token as used
   - Connector status becomes `ONLINE`

---

## API Reference

### POST /api/connectors
Create connector. Returns without token.

**Request:**
```json
{
  "tenant_id": 1,
  "name": "my-connector",
  "description": "...",
  "wireguard_ip": "10.255.0.X",
  "wireguard_endpoint": "vpn.example.com:51820",
  "wireguard_allowed_ips": "10.0.0.0/8",
  "networks": [
    { "network_cidr": "10.0.0.0/8", "description": "..." }
  ]
}
```

**Response (201):**
```json
{
  "id": 42,
  "status": "PENDING",
  "bootstrap_pending": true,
  "wireguard_config_preview": "...",
  ...
}
```

---

### POST /api/connectors/:id/bootstrap-package
Generate and download one-shot bootstrap package.

**Auth:** Admin only  
**Rate limit:** Once per 15 minutes (if active token exists)

**Request:**
```
POST /api/connectors/42/bootstrap-package
Cookie: session=...
```

**Response (200):**
```
Content-Type: text/plain; charset=utf-8
Content-Disposition: attachment; filename="my-connector.env"

export CONNECTOR_TOKEN="nc_..."
...
```

**Errors:**
- `409 Conflict` — Active bootstrap token exists
- `400 Bad Request` — Connector not found or invalid state

---

### POST /api/connectors/:id/bootstrap-package?rotate=true
Force re-issue, revoking the old token.

**Auth:** Admin only  
**Audit event:** `connector_bootstrap_issued`

---

## Security Considerations

### Token Storage
- **In DB:** Only hash stored (`SHA-256`)
- **In audit logs:** Token preview masked (e.g., `nc_XXXX…ZZZZ`)
- **In .env file:** Plaintext (user responsibility to secure)
- **In browser memory:** Never logged or persisted

### TTL
- **Default:** 15 minutes
- **Rationale:** Enough time to deploy agent, short enough to minimize exposure window

### Audit Trail
Every bootstrap token generation is logged:
```json
{
  "action": "connector_bootstrap_issued",
  "actor_id": 3,
  "object_type": "connector",
  "object_id": "42",
  "source_ip": "203.0.113.5",
  "created_at": "2026-05-31T03:15:00Z"
}
```

### Multi-Deployment Scenario
If you have multiple connector agents for HA:
1. Generate bootstrap package once
2. Use **same** `.env` for all agents in the replica set
3. All agents use the same token; token becomes "used" on first successful heartbeat
4. Subsequent heartbeats from other agents work fine (token hash is still valid)

---

## Troubleshooting

### "Active bootstrap token already exists"
**You already generated a package for this connector.** Download the original `.env` file, or:
```bash
# Admin rotates the token (revokes old, generates new)
curl -X POST "http://localhost:8085/api/connectors/42/bootstrap-package?rotate=true" \
  -H "Cookie: session=..." \
  -o new.env
```

### Heartbeat fails: "Connector not found" (401)
- Token may have **expired** (> 15 minutes old)
- Token may have been **revoked**
- Connector may have been **deleted**

→ Admin must rotate to generate a fresh token.

### .env file corrupted or lost
**Cannot recover the original.** Admin must rotate:
```bash
curl -X POST "http://localhost:8085/api/connectors/:id/bootstrap-package?rotate=true" \
  -H "Cookie: session=..." \
  -o new.env
```

---

## Migration from Legacy Flow

**Old (Phase 7 and earlier):**
```
POST /api/connectors → returns connector_token in JSON
```

**New (Phase 8.1):**
```
POST /api/connectors → returns connector without token
POST /api/connectors/:id/bootstrap-package → download token in .env file
```

No changes needed in the **Python agent**. Just supply the token via `CONNECTOR_TOKEN` env var, and it works the same way.

---

## References

- [DEPLOY_PRODUCTION.md](./DEPLOY_PRODUCTION.md) — Full production deployment guide
- [Phase 8.1 Report](../../reports/connectors/PHASE_8_1_SECURE_ONBOARDING_REPORT.md) — Implementation details
