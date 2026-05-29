# Phase 1 — Connector Base Module

## Delivered

- SQL migration `0020_connectors_bastion.sql`
- Drizzle schemas under `workspace/lib/db/src/schema/connectors.ts`
- `devices.connector_id` foreign key
- API module `workspace/artifacts/api-server/src/modules/connectors/`
- Web UI: **Infraestrutura → Conectores** (`/infrastructure/connectors`)
- Token generation, WG key pair, encrypted private key storage
- Heartbeat ingestion + ONLINE/OFFLINE (2 min threshold)
- Job creation + agent poll/result endpoints
- Read-only SSH policy enforcement on job create

## Acceptance

```text
Connector appears ONLINE in NetOps after agent heartbeat with valid token.
```

## Env (server)

```bash
NETOPS_WG_SERVER_PUBLIC_KEY=   # server WG public key (base64)
NETOPS_WG_ENDPOINT=vpn.example.com:51820
NETOPS_WG_DEFAULT_ALLOWED_IPS=10.0.0.0/8,192.168.0.0/16
NETOPS_WG_IP_POOL_BASE=10.255.0.
```

## Selftest

```bash
node tools/connectors-selftest.mjs
```
