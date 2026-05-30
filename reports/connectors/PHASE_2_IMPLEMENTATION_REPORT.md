# Connectors — Phase 2 Agent Implementation Report

**Date:** 2026-05-28  
**Status:** GO

## Summary

Implemented `infra/connector-agent/` — Python 3 container for customer-site bastion execution.

## Validation

| Check | Result |
|-------|--------|
| `python3 tools/connector-agent-selftest.py` | **6/6 OK** |
| `docker compose build` (infra/connector-agent) | **OK** |
| Read-only SSH policy | Blocks destructive + shell meta |
| API contract | `{ jobs: [...] }`, numeric job ids |

## Deploy (client site)

```bash
cd infra/connector-agent
cp .env.example .env
docker compose up -d --build
```

## Next (Phase 4)

Route device collect paths through connector jobs when `devices.connector_id` is set.
