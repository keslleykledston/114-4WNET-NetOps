# H3 SNMP_FAST BGP — Current State

**Date:** 2026-05-28  
**Status:** **Current baseline after H3 closure**

---

## 1) Escopo consolidado

H3 cobre estado operacional BGP por SNMP_FAST, com superficie read-only para consumo de NOC:

- coleta operacional via SNMP (gated)
- persistencia de peers/jobs
- leitura via API GET
- visualizacao via UI BGP Operations

Nao cobre nesta baseline:

- config compliance
- SSH detail operacional
- discovery pipeline

---

## 2) Arquitetura em camadas

### A) SNMP_FAST operational path

1. preflight SNMP (`sysDescr.0`, `bgpVersion.0`)
2. resolve credencial SNMP (redacted output)
3. walk peers (RFC4273 baseline)
4. persistencia operacional
5. exposicao por GET API
6. render na UI read-only

### B) SSH_FULL_CONFIG (separado)

- trilha formal separada
- nao alimenta cards/tabela de BGP Operations

### C) SSH_DETAIL (separado)

- trilha de drilldown
- nao faz parte da coleta operacional H3

---

## 3) Endpoint state

- `GET /api/operational/bgp?device_id=X`
  - lista peers operacionais + freshness/job
- `GET /api/operational/bgp/summary?device_id=X`
  - totais agregados para cards
- `POST /api/operational/bgp/collect`
  - coleta gated por flag

---

## 4) Gate state

- `NETOPS_SNMP_BGP_REAL_ENABLED`
  - `false` (default operacional seguro)
  - `true` apenas em janela controlada
- `SNMP_POLL_ENABLED`
  - manter `false` para evitar execucao fora de janela H3 controlada

---

## 5) Runtime baseline validado

Piloto de referencia:

- `device_id=1`
- peers persistidos: `45`
- collector usado: `rfc4273`
- freshness: `fresh` no snapshot validado

---

## 6) Seguranca baseline

- nunca expor community/password/token em docs/logs
- nao persistir credencial resolvida em tabela operacional
- UI H3.3 usa somente GET (sem collect button)
- sem SSH/discovery no fluxo H3 operacional

---

## 7) Limitacoes conhecidas

- `received/accepted/advertised prefixes` podem ficar `null`
- sem contadores IPv6 avancados por peer nesta fase
- sem bulk collection
- scheduler operacional BGP ainda nao formalizado

---

## 8) Referencias de commit

- `156e807` — skeleton operacional BGP
- `320555f` — credential resolver
- `3467933` — collect real SNMP fast path
- `01f36c1` — UI read-only BGP Operations
- `605ebcc` — runtime smoke UI report

---

## 9) Direcao recomendada

- H3.4: scheduler controlado
- H3.5: melhorias de freshness na UI
- H4: trilha SSH_FULL_CONFIG formal
- extensao operacional: OSPF/MPLS
