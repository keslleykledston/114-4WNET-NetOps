# Testes e validação

## Camadas de teste

| Camada | Onde | Como |
|--------|------|------|
| Typecheck | `workspace/` | `pnpm run typecheck` |
| Build | `workspace/` | `pnpm run build` |
| Selftest (unit/offline) | `tools/*.mjs` | `node tools/<name>.mjs` |
| Smoke (HTTP runtime) | `tools/*smoke*.mjs` | API up + `ADMIN_*` env |
| CI | `.github/workflows/ci.yml` | typecheck + docker build |
| Manual lab | `reports/` | Phase reports + captures |

## CI

**Arquivo:** `.github/workflows/ci.yml`

1. Node 22, pnpm 10.29.3
2. `pnpm install --frozen-lockfile` in `workspace/`
3. `pnpm run typecheck` + `pnpm run build`
4. `docker compose config` + `docker build`

## Selftests por domínio

### L2 Circuits

| Script | Foco |
|--------|------|
| `l2-s6730-parser-selftest.mjs` | S6730 L2VC + VSI + regressions |
| `l2-circuit-huawei-vsi-selftest.mjs` | VSI multipoint cases A–D |
| `l2-dot1q-parser-selftest.mjs` | dot1q device-1 regression |
| `l2-classification-selftest.mjs` | Classification helpers |
| `l2-findings-interface-match-selftest.mjs` | Finding attach by key |
| `l2-collector-selftest.mjs` | SSH command allowlist |
| `l2-classification-dryrun.mjs` | End-to-end dryrun |
| `l2-stale-fix-validate.mjs` | Operational stale + refresh |
| `l2-ops-1b-refresh-flag-off-smoke.mjs` | Flag OFF → 503 |
| `l2-ops-1c-refresh-real-device1.mjs` | Real device 1 refresh |

### BGP / SNMP

| Script | Foco |
|--------|------|
| `snmp-fast-operational-selftest.mjs` | Interfaces SNMP_FAST |
| `snmp-fast-bgp-selftest.mjs` | BGP SNMP |
| `bgp-peer-parser-selftest.mjs` | BGP parser |
| `bgp-peer-drilldown-snapshot-selftest.mjs` | Drilldown cache |
| `operational-pilot-smoke.mjs` | Pilot gate |

### Connectors

| Script | Foco |
|--------|------|
| `connectors-selftest.mjs` | Core connector logic |
| `connectors-phase4-selftest.mjs` | Phase 4 |
| `connectors-config-bundle-parse-selftest.mjs` | Config bundle |
| `connectors-post-ssh-autocollect-selftest.mjs` | Autocollect |

### Compliance / RBAC / outros

| Script | Foco |
|--------|------|
| `compliance-runtime-smoke.mjs` | Compliance API |
| `compliance-deep-selftest.mjs` | Engine rules |
| `rbac-selftest.mjs` | Permissions |
| `user-management-selftest.mjs` | Users CRUD |
| `provisioning-preview-selftest.mjs` | Preview engine |
| `scheduler-selftest.mjs` | Scheduler |
| `netbox-readonly-selftest.mjs` | NetBox |

## Padrão smoke HTTP

```javascript
const base = process.env.API_BASE ?? "http://127.0.0.1:8080";
// POST /api/auth/login → cookie/token
// Exercitar endpoint alvo
// Assert status + JSON shape
```

Env comuns: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SMOKE_DEVICE_ID`, `API_BASE`

## Padrão selftest in-process

Muitos scripts usam `pnpm dlx tsx -e "..."` com imports diretos dos parsers/services.

## Validação pós-mudança (checklist agente)

1. `cd workspace && pnpm run typecheck`
2. Selftests do domínio tocado (`node tools/...`)
3. Se API/frontend: `docker compose build api web && up -d`
4. Smoke manual se flags ON e lab disponível
5. **Não** commitar sem pedido

## Evidências históricas

Phase reports em `reports/l2-circuits/`, `reports/collection/`, `reports/bgp/`, `reports/connectors/`

Fixtures parser: `workspace/artifacts/api-server/src/modules/l2circuits/parsers/__fixtures__/`

## Gaps conhecidos

- Sem suite Jest/Vitest unificada — predominam scripts Node ad hoc
- E2E browser (Playwright) não presente
- Testes SNMP/SSH reais dependem de lab e flags
