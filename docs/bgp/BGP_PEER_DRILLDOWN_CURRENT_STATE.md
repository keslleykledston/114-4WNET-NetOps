# BGP Peer Drilldown — Estado atual (D2–D6B)

**Última consolidação:** 2026-05-26

**Objetivo deste ficheiro:** orientar rapidamente agentes/devs/NOC sobre o que já existe e o que não fazer.

---

## O que é

- Vista **read-only** de **um** peer BGP (Huawei VRP / NE8000 mindset).
- Dados: **snapshot** em DB + **`collected_configs.raw_config`** (fallback mínimo conforme implementação).
- **Não** substitui compliance global; explica **um** peer.

---

## O que já está entregue

| Área | Estado |
|------|--------|
| API GET drilldown | Sim (`source=snapshot`, policies opcionais, `snapshot_id` / `job_id`) |
| Campo `cache` (D6) | Sim: fresh / expired / miss / recomputed |
| `force_recompute=true` | Sim: reparse local, sem rede |
| Histórico | Sim: lista com `warningsCount`, `freshnessStatus` |
| Compare histórico | Sim: `left` + `right` ids |
| UI `/bgp/peer-drilldown` | Sim: drilldown, histórico, recalcular, comparar |
| SSH detail POST | Sim, **gate default off** → 503 |
| Rotas (received/accepted/advertised) | Não: `requested=false` |

---

## Endpoints (memória rápida)

```
GET  /api/bgp/peers/:deviceId/:peer/drilldown
GET  /api/bgp/peers/:deviceId/:peer/drilldown/history
GET  /api/bgp/peers/:deviceId/:peer/drilldown/history/compare?left=&right=
POST /api/bgp/peers/:deviceId/:peer/drilldown/detail
```

Auth: `devices.read` (session/cookie como resto da app).

---

## Flags importantes

| Env | Efeito |
|-----|--------|
| `BGP_DRILLDOWN_SSH_DETAIL_ENABLED` | `false` (default) → POST detail **503** |
| `BGP_DRILLDOWN_CACHE_TTL_SECONDS` | TTL do cache (default 7d) |
| `SNMP_POLL_ENABLED` | Independente do drilldown; para smoke “zero SNMP poll” usar `false` via override se o compose não fixar |

---

## Segurança (não negociar)

- Não prometer **zero comandos** se NOC ligar SSH detail: aí há **display** allowlist apenas.
- Drilldown GET + cache + compare: **sem SSH** no caminho feliz.
- Não logar community/password/token em relatórios ou tickets.
- Route-table peer commands: **não** estão no allowlist D4.

---

## Onde aprofundar

| Necessidade | Documento |
|-------------|-----------|
| Fechamento fases + commits | `reports/bgp/BGP_PEER_DRILLDOWN_CLOSURE_REPORT.md` |
| Arquitetura / camadas | `docs/bgp/BGP_PEER_DRILLDOWN_ARCHITECTURE.md` |
| Contrato de dados | `docs/bgp/BGP_PEER_DRILLDOWN_DATA_CONTRACT.md` |
| Checklist seguro | `docs/bgp/BGP_PEER_DRILLDOWN_SAFE_CHECKLIST.md` |
| Por fase (smoke/planos) | `reports/bgp/PHASE_BGP_PEER_DRILLDOWN_*.md` |

---

## Próximo trabalho sugerido (fora deste doc)

1. **D4.2C:** SSH detail real, **1 peer**, janela NOC, relatório dedicado.
2. **D7:** route tables com confirmação e lista fechada de comandos.
3. **UX:** integração mais estreita com a lista de peers BGP (deep links, estado).

---

## GO / NO-GO rápido

- **Baseline snapshot + cache + UI:** **GO**
- **SSH detail em prod sem processo:** **NO-GO**
- **Rotas on-demand sem D7:** **NO-GO**
