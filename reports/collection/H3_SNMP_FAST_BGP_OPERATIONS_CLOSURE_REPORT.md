# H3 — SNMP_FAST BGP Operations Closure Report

**Date:** 2026-05-28  
**Scope:** H3.1 -> H3.3B  
**Status:** **GO (phase closure)**

---

## 1) Resumo executivo

H3 entregou trilha operacional BGP via SNMP_FAST, do esqueleto backend ate validacao runtime de API/UI em modo read-only.

Resultado consolidado:

- pipeline operacional BGP disponivel com preflight, resolve de credencial, coleta, persistencia e UI
- runtime validado com dados reais persistidos do `device_id=1`
- nenhuma dependencia de SSH/discovery para leitura operacional
- gates de coleta funcionando (coleta bloqueada quando flag off)

---

## 2) Arquitetura consolidada

### SNMP_FAST operacional

- objetivo: estado operacional BGP (peers/freshness) com superficie minima
- caminho: preflight SNMP -> walk BGP -> persistencia operacional -> GET API -> UI read-only
- escopo H3: 1 device piloto

### SSH_FULL_CONFIG

- permanece fora da trilha H3 operacional
- responsabilidade: coleta/config completa (separada)
- sem uso para popular BGP Operations UI

### SSH_DETAIL

- permanece em trilha drilldown separada
- nao faz parte da coleta operacional BGP SNMP_FAST
- H3 nao aciona SSH_DETAIL

---

## 3) Fluxo H3 (fim a fim)

1. **preflight**
   - `sysDescr.0` (`1.3.6.1.2.1.1.1.0`)
   - `bgpVersion.0` (`1.3.6.1.2.1.15.1.1.0`)
2. **credential resolver**
   - cadeia de resolucao SNMP com metadata redacted
3. **collect**
   - walk BGP por RFC4273 com fallback planejado
4. **persist**
   - `operational_bgp_collection_jobs`
   - `operational_bgp_peers`
5. **freshness**
   - calculo por janela configuravel
6. **UI**
   - rota read-only para cards + tabela de peers

---

## 4) Commits principais

- `156e807` — base SNMP_FAST BGP peers skeleton
- `320555f` — credential resolver SNMP + fail-fast credencial
- `3467933` — coleta real peers via SNMP fast path
- `01f36c1` — UI read-only BGP Operations
- `605ebcc` — runtime smoke UI H3.3B documentado

---

## 5) Endpoints oficiais

- `GET /api/operational/bgp?device_id=X`
- `GET /api/operational/bgp/summary?device_id=X`
- `POST /api/operational/bgp/collect`

Contrato operacional:

- GETs usados pela UI H3.3
- POST protegido por gate (`NETOPS_SNMP_BGP_REAL_ENABLED`)

---

## 6) Gates

- `NETOPS_SNMP_BGP_REAL_ENABLED`
  - `true`: permite tentativa de coleta BGP operacional
  - `false`: POST retorna `SNMP_FAST_BGP_DISABLED`
- `SNMP_POLL_ENABLED`
  - mantido `false` em janelas H3 de validacao operacional
  - evita poller paralelo fora do escopo controlado

---

## 7) Segurança

Garantias aplicadas em H3:

- sem exposicao de secrets em logs/relatorios
- sem persistencia de credential SNMP em payload operacional
- metadata redacted (`length/source`, sem `value`)
- sem SSH na trilha H3 operacional
- sem discovery na trilha H3 operacional

---

## 8) Runtime validado

Piloto validado:

- `device_id=1`
- peers persistidos: **45**
- fonte de coleta: **RFC4273**
- API/summary e UI read-only consumindo dados persistidos

---

## 9) Limitacoes atuais

- prefix counters permanecem `null` (sem inventar valores)
- sem counters IPv6 avancados por peer
- sem bulk (escopo piloto 1 device)
- sem scheduler real de coleta operacional BGP em producao

---

## 10) Proximos passos recomendados

- **H3.4** scheduler controlado para coleta BGP operacional
- **H3.5** evolucao de freshness na UI (estado/alerta visual)
- **H4** formalizacao SSH_FULL_CONFIG separado de operational
- expansao operacional para OSPF/MPLS

---

## 11) GO / NO-GO final H3

### GO

- [x] backend operacional BGP SNMP_FAST consolidado
- [x] preflight + credential resolver + collect + persist + freshness
- [x] UI read-only operacional ativa
- [x] runtime piloto com 45 peers persistidos
- [x] gates e seguranca validados

### NO-GO

- [ ] nao aplicavel para fechamento H3

**Veredito final:** **GO — H3 oficialmente fechado.**
