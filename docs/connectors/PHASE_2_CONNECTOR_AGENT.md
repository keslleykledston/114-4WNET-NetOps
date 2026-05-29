# Phase 2 — Connector Agent Container

**Status:** Implemented  
**Path:** `infra/connector-agent/`

## Delivered

- Docker image with Python 3, WireGuard tools, SSH, SNMP, ping, traceroute
- Agent loop: heartbeat + job poll + local execution + result upload
- Read-only SSH security policy (`agent/security.py`)
- Job types: PING, TRACEROUTE, TCP_CHECK, SNMP_GET, SNMP_WALK, SSH_COMMAND, ROUTE_CHECK, WG_STATUS
- Logs with secret masking
- Healthcheck script
- Docs: INSTALL, SECURITY, OPERATIONS
- Selftest: `tools/connector-agent-selftest.py`

## Acceptance

```text
Container starts → heartbeat ONLINE on server → jobs execute locally → results posted
```

See [infra/connector-agent/README.md](../../infra/connector-agent/README.md).
