# PHASE H3 — SNMP_FAST BGP Peers Plan Report

**Date:** 2026-05-27  
**Phase:** H3 plan only  
**Status:** **GO (plan)** — no code, no network, no pilot execution  
**Normative doc:** `docs/collection/H3_SNMP_FAST_BGP_PEERS_PLAN.md`

---

## 1. Objetivo

Entregar plano para **coleta operacional BGP rápida via SNMP** (`SNMP_FAST` → `operational_bgp_peers`), sem configuração, sem SSH, sem compliance, sem alterar discovery atual.

---

## 2. Escopo confirmado

| In scope | Out of scope |
|----------|----------------|
| Estado peer (FSM, admin/oper, AS, uptime) | route-policy, community, prefix-list |
| Prefix counters **se OID existir** | Config parse / running-config |
| Preflight sysDescr + bgpVersion | SSH / D4 drilldown |
| Jobs + freshness | Compliance engine |
| API + UI **futura** (spec) | Mudar discovery BGP SSH |
| Tabelas dedicadas BGP | Cache cego sem TTL |

---

## 3. Arquitetura (resumo)

```text
SNMP_FAST preflight → walk peer MIB(s) → operational_bgp_peers
                              ↑
              operational_bgp_collection_jobs
```

| Item | Valor |
|------|-------|
| Fonte | `SNMP_FAST` / persist `source=snmp` |
| Destino | `operational_bgp_peers` |
| Jobs | `operational_bgp_collection_jobs` (`layer=snmp_fast`, `scope=bgp_peers`) |

**Separado de H2 interfaces** — sem reusar `operational_collection_jobs` de interfaces.

---

## 4. Modelo (campos)

`device`, `peer_ip`, `peer_as`, `peer_type`, `vrf`, `afi`, `safi`, `admin_status`, `oper_status`, `fsm_state`, `uptime`, `received_prefixes`, `accepted_prefixes`, `advertised_prefixes`, `last_change`, `collected_at`, `freshness` (+ `collection_job_id`, `source`).

Detalhe colunar: ver plano § modelo.

---

## 5. Coletores e OIDs

| Ordem | MIB |
|-------|-----|
| 1 | RFC4273 BGP4-MIB |
| 2 | BGP4-V2-MIB (se agente suportar) |
| 3 | Huawei BGP MIB (fallback piloto) |

**Prioridade campos:** remote addr, remote AS, state, uptime, admin status, prefix counters (nullable).

**Preflight OIDs:**

- `1.3.6.1.2.1.1.1.0` — sysDescr.0  
- `1.3.6.1.2.1.15.1.1.0` — bgpVersion.0  

**Peer table baseline:** `1.3.6.1.2.1.15.2.1.*` (bgpPeerRemoteAddr `.7`, bgpPeerRemoteAs `.4`, bgpPeerState `.2`, bgpPeerAdminStatus `.3`, bgpPeerFsmEstablishedTime `.16`).

Huawei OIDs: **TBD no piloto** — plano reserva inventory sem inventar árvore no GO plano.

---

## 6. Tabelas novas

| Tabela | Função |
|--------|--------|
| `operational_bgp_collection_jobs` | run metadata, status, `collector_used`, errors |
| `operational_bgp_peers` | fatos peer append-only + freshness |

---

## 7. API futura

| Método | Path |
|--------|------|
| POST | `/api/operational/bgp/collect` |
| GET | `/api/operational/bgp?device_id=X` |
| GET | `/api/operational/bgp/summary?device_id=X` |

Erros preflight: `SNMP_PREFLIGHT_TIMEOUT`, `SNMP_PREFLIGHT_AUTH`, `SNMP_BGP_UNAVAILABLE`.

---

## 8. Timeout / retry (piloto)

| Etapa | Timeout | Retry |
|-------|---------|-------|
| Preflight | 3–5 s (default 4 s) | 0–1 (default 1) |
| Walk BGP | ≤ 5–8 s piloto | 0–1 |

Alinhado espírito H2.1E; **mais curto** que IF-MIB full walk.

---

## 9. Freshness

| Status | Janela |
|--------|--------|
| fresh | < 15 min |
| stale | 15 min – 24 h |
| expired | > 24 h |
| unknown | falha / parcial |

---

## 10. UI futura

**BGP Operations** — cards UP / DOWN / IDLE / ACTIVE / UNKNOWN; freshness badge; **sem drilldown**.

---

## 11. Riscos registrados

- IPv6 gaps  
- Vendor MIB variance  
- VRF mapping  
- Peer duplicates  
- Prefix counters frequentemente **null** em BGP4-MIB puro  

---

## 12. Checklist GO (esta fase — plano)

| # | Critério | Resultado |
|---|----------|-----------|
| 1 | Plano criado | **PASS** |
| 2 | OIDs definidos | **PASS** (baseline + TBD Huawei) |
| 3 | Tabela definida | **PASS** |
| 4 | API definida | **PASS** |
| 5 | Sem código | **PASS** |
| 6 | Sem rede | **PASS** |

---

## 13. Checklist NO-GO (evitado no plano)

| Critério | Plano |
|----------|-------|
| Misturar config com operação | **evitado** — tabela só SNMP ops |
| Usar SSH | **proibido** |
| Cache cego | **evitado** — freshness obrigatório |

---

## 14. Veredito

**H3 PLAN = GO**

Pronto para **H3.1 implementação** (schema + service + selftest) e depois **H3.2 piloto NOC** (1 device, rede OK — lição H2.1G).

---

## 15. Próximos passos (não executados aqui)

1. Migration `operational_bgp_*` + Drizzle schema.  
2. `collectSnmpBgpPeersOnly` + preflight reuse.  
3. Routes + rate limit + pilot allowlist.  
4. OID inventory Huawei no device piloto.  
5. UI BGP Operations (H3.3).  

---

## 16. Artefatos

| Path | Tipo |
|------|------|
| `docs/collection/H3_SNMP_FAST_BGP_PEERS_PLAN.md` | Plano normativo |
| `reports/collection/PHASE_H3_SNMP_FAST_BGP_PEERS_PLAN_REPORT.md` | Este relatório |
