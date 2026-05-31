---
name: connectors-ops
description: >-
  WireGuard connectors, bastion agent, job queue, config autocollect. Use for
  /infrastructure/connectors, WG provision, connector-agent, or bastion deploy.
---

# Connectors Operations

**Agent:** `.cursor/agents/connectors.md`  
**Workflow:** `.cursor/workflows/deploy-containers.md`

## Architecture rule

NetOps API does **not** SSH/SNMP customer devices directly in production — use connector agent over WireGuard.

## Bounded paths

| Area | Path |
|------|------|
| API | `modules/connectors/` |
| Config parse | `modules/config-backup/` |
| Agent | `infra/connector-agent/agent/` |
| Deploy | `deploy/bastion/` |
| WG hub | `infra/wireguard-hub/` |
| UI | `features/connectors/`, `pages/connectors.tsx` |
| Schema | `lib/db/schema/connectors.ts` |

## Doc (one file)

`docs/connectors/ARCHITECTURE.md`

## Tests

```bash
node tools/connectors-selftest.mjs
node tools/connectors-config-bundle-parse-selftest.mjs
```

## Secrets

Never commit `NETOPS_WG_HUB_PRIVATE_KEY`, `CONNECTOR_TOKEN`
