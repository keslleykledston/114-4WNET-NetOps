# Phase 3 — Job Queue

## Server (implemented)

- `connector_jobs` with types: `PING`, `TRACEROUTE`, `TCP_CHECK`, `SSH_COMMAND`, `SNMP_GET`, `SNMP_WALK`, `ROUTE_CHECK`, `WG_STATUS`
- Status flow: `PENDING` → `RUNNING` → `SUCCESS` | `FAILED` | `TIMEOUT`
- Agent claims jobs on poll (marks `RUNNING`)
- Timeout sweeper on poll

## Agent (phase 2)

Must execute jobs only inside customer LAN; never call device management IPs from NetOps Server.
