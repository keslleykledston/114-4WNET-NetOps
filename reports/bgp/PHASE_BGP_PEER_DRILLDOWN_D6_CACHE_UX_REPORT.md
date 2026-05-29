# PHASE BGP Peer Drilldown D6 — Cache / History UX

**Date:** 2026-05-26
**Base:** D5 `b8ee973`, D5B runtime smoke `d53008a`
**Scope:** UX operacional do histórico/cache — **sem rede**

---

## 1. Objetivo

Melhorar usabilidade do cache/histórico do BGP Peer Drilldown sem SSH, SNMP, discovery ou writes em equipamento/NetBox.

---

## 2. Entregas

| # | Melhoria | Implementação |
|---|----------|---------------|
| 1 | Status cache visível | Campo `cache` no GET drilldown: `fresh` / `expired` / `miss` / `recomputed` + `configBuildSource` |
| 2 | Recalcular snapshot | Botão UI + query `force_recompute=true` — reparse `raw_config` local, sem rede |
| 3 | Histórico útil | `collected_at desc`, `source`, `configBuildSource`, `warningsCount`, `expiresAt`, `freshnessStatus` |
| 4 | Comparação simples | Selecionar 2 históricos → `GET .../history/compare?left=&right=` |
| 5 | Empty states | Sem histórico, cache expirado, sem raw_config |

---

## 3. API (read-only)

### GET drilldown

Query adicional:

- `force_recompute=true` — ignora cache fresh, rebuild local, persiste nova linha, `cache.status=recomputed`

Resposta inclui:

```json
"cache": {
  "status": "fresh|expired|miss|recomputed",
  "servedFromCache": true,
  "rowId": 12,
  "expiresAt": "2026-06-02T...",
  "configBuildSource": "raw_config"
}
```

### GET history

Itens enriquecidos:

- `warningsCount`
- `freshnessStatus`: `fresh` | `stale` | `expired`
- ordenação por `collected_at DESC`

### GET history/compare

`?left=<id>&right=<id>` — diff de import/export policy, AFI enabled, warnings (sem raw evidence).

---

## 4. Frontend

| Arquivo | Papel |
|---------|-------|
| `bgp-drilldown-cache-ux.tsx` | Banner cache, aviso recompute, empty states |
| `bgp-drilldown-history-panel.tsx` | Tabela histórico + compare |
| `bgp-drilldown-badges.tsx` | `CacheStatusBadge`, `HistoryFreshnessBadge` |
| `bgp-peer-drilldown-view.tsx` | Banner cache no drilldown |
| `bgp-peer-drilldown.tsx` | Botão **Recalcular snapshot** + tab Histórico |

---

## 5. Validações (sem rede)

| Comando | Resultado |
|---------|-----------|
| `pnpm typecheck` | PASS |
| `PORT=24780 BASE_PATH=/ pnpm run build` | PASS |
| `pnpm dlx tsx .../bgp-peer-drilldown-comparison.selftest.ts` | PASS |
| `pnpm dlx tsx .../bgp-peer-drilldown-cache-ux.selftest.ts` | PASS |
| `pnpm dlx tsx tools/bgp-drilldown-cache-ux-selftest.mjs` | PASS |

Smoke API/UI: endpoints read-only; recompute usa apenas DB local; SSH detail permanece gate 503 com flag off.

---

## 6. GO criteria

| Criterion | Met |
|-----------|-----|
| Cache status visível | **yes** |
| Histórico mais útil | **yes** |
| Recompute snapshot sem rede | **yes** (`force_recompute`, aviso UI) |
| Zero SSH/SNMP/discovery nesta fase | **yes** |

**Overall D6: GO**

---

## 7. Safety

- Nenhum SSH executado nesta fase.
- Nenhum SNMP poll.
- Nenhum discovery.
- Flags não habilitadas.
- Recompute = reparse `collected_configs.raw_config` + snapshot DB only.
