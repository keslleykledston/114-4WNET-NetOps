---
name: netops-smoke-validation
description: >-
  Runs NetOps validation: pnpm typecheck, domain selftests in tools/, HTTP
  smokes with ADMIN_* env, and CI parity. Use before closing phases, after
  parser/API changes, or when user asks to validate or smoke test.
---

# NetOps Smoke & Validation

## Quick CI parity

```bash
cd workspace
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
```

Root: `docker compose config && docker build -t netops-manager-ci .`

## Smoke HTTP pattern

```bash
export API_BASE=http://127.0.0.1:8080
export ADMIN_EMAIL=...
export ADMIN_PASSWORD=...
node tools/<smoke>.mjs
```

## Selftests by domain

| Domain | Scripts |
|--------|---------|
| L2 | `l2-*-selftest.mjs`, `l2-ops-*-smoke.mjs`, `l2-stale-fix-validate.mjs` |
| BGP/SNMP | `snmp-fast-*`, `bgp-*-selftest.mjs`, `operational-pilot-smoke.mjs` |
| Connectors | `connectors-*-selftest.mjs` |
| Compliance | `compliance-*-selftest.mjs`, `compliance-runtime-smoke.mjs` |
| RBAC | `rbac-selftest.mjs`, `user-management-selftest.mjs` |

Full list: `docs/ai/TESTING.md`

## Agent persona

`docs/ai/agents/qa-smoke-specialist.md`

## Rules

- Never log secrets from `.env`
- Real SNMP/SSH requires explicit flags ON + pilot device
- Document phase results in `reports/<area>/` when formal closure
- Do not commit unless user asks

## Container refresh after code change

```bash
tools/apply-containers.sh api web
# or
docker compose build api web && docker compose up -d api web
```
