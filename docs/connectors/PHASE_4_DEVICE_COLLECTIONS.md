# Phase 4 — Device collections via Connector

## Goal

Devices with `devices.connector_id` are collected **only** through the Connector Agent job queue. The NetOps Server does not open SSH/SNMP directly to those devices.

## Flow

```text
NetOps Server → create connector_jobs row (PENDING)
Connector Agent → GET /api/connectors/jobs/pending
Agent → SSH/SNMP/ICMP on customer LAN
Agent → POST /api/connectors/jobs/:id/result
NetOps → waitForJobResult() → process stdout / persist operational data
```

## Integrated modules (priority)

| Module | Connector path |
|--------|----------------|
| Device test-connection / test-connectivity | `connector-execution.service` |
| Device diagnostics `POST /devices/:id/diagnostics` | ping, TCP, SNMP sysName, SSH version |
| SNMP_FAST interfaces | `collectSnmpInterfacesViaConnector` |
| L2 discovery / operational refresh SSH | `runSSHCommandsForDevice` |
| BGP drilldown SSH detail | `runSSHCommandsForDevice` |

## Legacy direct mode

If `connector_id` is null, existing direct SSH/SNMP code paths remain. Recommended production mode is via connector.

## Job metadata

- `device_id` — inventory link
- `correlation_id` — trace batch operations
- `masked_payload_json` — audit-safe payload (secrets redacted)
- `payload_json` — full payload for agent execution (not exposed in UI)

## Timeouts (seconds)

| Job type | Default |
|----------|---------|
| PING | 15 |
| TCP_CHECK | 10 |
| SNMP_GET | 30 |
| SNMP_WALK | 120 |
| SSH_COMMAND | 120 |
| SSH_CONFIG_BUNDLE | 300 |
| BGP / L2VPN batches | 300 |

## Selftest

```bash
node tools/connectors-phase4-selftest.mjs
```

## Next phase (5.4)

After SSH probe succeeds, enqueue full config backup + parse — see `docs/connectors/SSH_CONFIG_BACKUP_PLAN.md`.
