# NetOps Connectors / Bastion — Architecture

## Decision

```text
WireGuard     = secure transport (NetOps Server ↔ Connector)
Connector Agent = SSH/SNMP/ICMP/NETCONF execution in customer LAN
NetOps Server = management, job queue, audit, UI
```

The NetOps Server **never** opens SSH/SNMP directly to customer equipment. All device access goes through a registered connector.

## Components

| Component | Role |
|-----------|------|
| **NetOps Server** | Tenants, connectors, WG config, jobs, audit, web UI |
| **Connector Agent** | WG client, heartbeat, job polling, local SSH/SNMP |
| **WireGuard** | Encrypted tunnel only — no business logic |

## Data model

- `tenants` — customer org
- `connectors` — bastion instance + token hash + WG keys (private key encrypted at rest)
- `connector_networks` — LAN CIDRs reachable via connector
- `connector_jobs` / `connector_job_results` — async work queue
- `connector_heartbeats` — liveness history
- `devices.connector_id` — routes inventory to a connector

## Security (phase 1)

- Per-connector bearer token (SHA-256 hash in DB)
- Token shown once at creation
- WG private keys encrypted with `SESSION_SECRET`
- Read-only SSH policy (`display` / `show` / `ping` / `traceroute` only)
- Blocked: `configure`, `system-view`, `commit`, `reload`, etc.
- Full audit on connector create, revoke, job create

## API surfaces

**Management** (session cookie): `/api/connectors/*`  
**Agent** (Bearer token, no session): `/api/connectors/heartbeat`, `/api/connectors/jobs/pending`, `/api/connectors/jobs/:id/result`

## Phases

| Phase | Status | Doc |
|-------|--------|-----|
| 1 Base module | Implemented | [PHASE_1_BASE.md](./PHASE_1_BASE.md) |
| 2 Connector Agent container | Planned | [PHASE_2_CONNECTOR_AGENT.md](./PHASE_2_CONNECTOR_AGENT.md) |
| 3 Job queue | Server + API ready | [PHASE_3_JOB_QUEUE.md](./PHASE_3_JOB_QUEUE.md) |
| 4 Device integration | Planned | [PHASE_4_DEVICE_INTEGRATION.md](./PHASE_4_DEVICE_INTEGRATION.md) |
| 5 Monitoring | Planned | [PHASE_5_MONITORING.md](./PHASE_5_MONITORING.md) |

See [PAYLOAD_EXAMPLES.md](./PAYLOAD_EXAMPLES.md) for request/response samples.
