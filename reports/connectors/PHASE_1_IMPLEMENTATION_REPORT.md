# Connectors / Bastion — Phase 1 Implementation Report

**Date:** 2026-05-28  
**Status:** GO (server + UI base)

## Summary

Implemented the NetOps Connectors module per architecture directive: WireGuard as transport, Connector Agent as executor (API contract ready), server never touches customer devices directly in this phase.

## Delivered

| Area | Items |
|------|--------|
| DB | `0020_connectors_bastion.sql`, Drizzle schemas, `devices.connector_id` |
| API | Tenants, connectors CRUD, WG generate/config, heartbeat, jobs, diagnostics |
| Security | Token hash, encrypted WG private key, read-only SSH policy |
| UI | `/infrastructure/connectors` list + detail tabs |
| Tests | `tools/connectors-selftest.mjs` |
| Docs | `docs/connectors/*` |

## Validation

```bash
node tools/connectors-selftest.mjs
pnpm --filter @workspace/api-server run typecheck
```

## Next

- Phase 2: `infra/connector-agent` runtime (Docker on customer site)
- Phase 4: route existing collect paths through `connector_id` jobs
