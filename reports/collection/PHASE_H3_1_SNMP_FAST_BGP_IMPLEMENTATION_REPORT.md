# PHASE H3.1 — SNMP_FAST BGP Peers Implementation

**Date:** 2026-05-27
**Plan:** `docs/collection/H3_SNMP_FAST_BGP_PEERS_PLAN.md`
**Status:** **GO** (local code + selftests; **no live SNMP**, **no network pilot**)

---

## 1. Objetivo

Pipeline local de coleta operacional BGP via SNMP — **stub/offline** com gate `NETOPS_SNMP_BGP_REAL_ENABLED=false` por default.

---

## 2. Entregáveis

### DB

| Item | Path |
|------|------|
| Migration | `workspace/lib/db/migrations/0018_operational_bgp_peers.sql` |
| Schema | `workspace/lib/db/src/schema/operational_bgp.ts` |
| Export | `workspace/lib/db/src/schema/index.ts` |

**Tabelas:**

- `operational_bgp_collection_jobs` — `id`, `device_id`, `status`, `started_at`, `finished_at`, `error_code`, `peer_count`, `freshness`
- `operational_bgp_peers` — campos H3 + `collection_job_id` (rastreio job)

### API module

`workspace/artifacts/api-server/src/modules/operational-bgp/`

| File | Role |
|------|------|
| `operational-bgp.types.ts` | DTOs, MIB order |
| `operational-bgp.gate.ts` | `NETOPS_SNMP_BGP_REAL_ENABLED` |
| `operational-bgp.errors.ts` | `SNMP_FAST_BGP_DISABLED` / 503 |
| `operational-bgp.freshness.ts` | fresh 15m / stale 24h |
| `operational-bgp.preflight.ts` | sysDescr.0 + bgpVersion.0 OIDs; offline preflight |
| `operational-bgp.collector.ts` | `collectBgpPeers()` stub; MIB order RFC4273 → V2 → Huawei |
| `operational-bgp.service.ts` | GET/POST + persist |
| `operational-bgp.controller.ts` | handlers |
| `operational-bgp.routes.ts` | routes |

Registro: `workspace/artifacts/api-server/src/routes/index.ts`

### Selftests

| Tool | Result |
|------|--------|
| `tools/snmp-fast-bgp-preflight-selftest.mjs` | **PASS** |
| `tools/snmp-fast-bgp-selftest.mjs` | **PASS** |

---

## 3. Comportamento runtime (H3.1)

| Env | Default | Efeito |
|-----|---------|--------|
| `NETOPS_SNMP_BGP_REAL_ENABLED` | **false** | `POST /api/operational/bgp/collect` → **503** `SNMP_FAST_BGP_DISABLED` |

**Collector:** `collectBgpPeers()` — **sem snmpWalk**; retorna `peers: []`, `stub: true`, warnings `H3.1 stub mode`.

**Preflight:** `runBgpPreflightOffline()` — valida OIDs; **sem UDP**.

**MIB ordem:** `rfc4273` → `bgp4v2` → `huawei` (placeholders V2/Huawei).

---

## 4. API

| Method | Path | H3.1 behavior |
|--------|------|----------------|
| POST | `/api/operational/bgp/collect` | Flag false → **503** |
| GET | `/api/operational/bgp?device_id=X` | **200** `{ peers: [], freshness: "unknown", ... }` |
| GET | `/api/operational/bgp/summary?device_id=X` | **200** `{ total: 0, counts: {...}, freshness: "unknown" }` |

Pilot allowlist: reusa `SNMP_FAST_PILOT_DEVICE_IDS` (default `1`).

Audit collect: `operational_snmp_fast_bgp_collect`.

---

## 5. Validação local

```bash
cd workspace && pnpm typecheck
pnpm --filter @workspace/api-server build
pnpm dlx tsx tools/snmp-fast-bgp-preflight-selftest.mjs
pnpm dlx tsx tools/snmp-fast-bgp-selftest.mjs
```

| Check | Result |
|-------|--------|
| `pnpm typecheck` | **PASS** |
| `@workspace/api-server build` | **PASS** |
| Selftests | **PASS** |

**Não executado:** SNMP live, SSH, discovery change, compliance, docker pilot.

---

## 6. Checklist GO

| # | Critério | Result |
|---|----------|--------|
| 1 | Schema criado | **PASS** |
| 2 | Endpoints sobem (build) | **PASS** |
| 3 | Flag false → 503 | **PASS** (code) |
| 4 | GET vazio / unknown | **PASS** (code) |
| 5 | Zero rede | **PASS** |
| 6 | Zero SSH | **PASS** |
| 7 | Zero discovery | **PASS** |

---

## 7. Checklist NO-GO (evitado)

| Critério | H3.1 |
|----------|------|
| Walk SNMP real | **não** |
| Config snapshot | **não** |
| Compliance | **não** |
| SSH | **não** |

---

## 8. Veredito

**H3.1 = GO** — pronto para **H3.2** (walk RFC4273 live + piloto NOC) com migration `0018` aplicada no ambiente.

---

## 9. Próximo (H3.2)

1. Aplicar migration `0018` no DB.
2. `NETOPS_SNMP_BGP_REAL_ENABLED=true` só em janela NOC.
3. Implementar walk `1.3.6.1.2.1.15.2.1.*` + preflight live.
4. Piloto device 1 — rede OK (lição H2.1G).
