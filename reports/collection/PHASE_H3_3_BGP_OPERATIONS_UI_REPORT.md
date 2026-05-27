# PHASE H3.3 — BGP Operations UI Report

**Date:** 2026-05-27
**Base:** `3467933` (`feat(operational): collect BGP peers via SNMP fast path`)
**Status:** **GO**

---

## 1) Objetivo

Entregar tela read-only para estado operacional BGP via SNMP, sem acionar coleta.

Escopo H3.3:

- rota dedicada de operacao BGP
- selector de device
- cards de status
- tabela de peers
- empty state operacional
- somente GET (`/api/operational/bgp` e `/api/operational/bgp/summary`)

---

## 2) Entregas

### Novos arquivos

- `workspace/artifacts/netops-manager/src/features/operational-bgp/operational-bgp-api.ts`
- `workspace/artifacts/netops-manager/src/features/operational-bgp/operational-bgp-state-badge.tsx`
- `workspace/artifacts/netops-manager/src/pages/operational-bgp.tsx`

### Arquivos alterados

- `workspace/artifacts/netops-manager/src/App.tsx`
  - novas rotas:
    - `/operational/bgp`
    - `/bgp/operations`
- `workspace/artifacts/netops-manager/src/components/layout.tsx`
  - item de sidebar: **BGP Operations**

### Relatorio

- `reports/collection/PHASE_H3_3_BGP_OPERATIONS_UI_REPORT.md`

---

## 3) UI implementada

- **Device selector** com `useListDevices()`
- **Cards**
  - total peers
  - established
  - idle
  - active/connect
  - down/unknown
  - freshness
- **Tabela**
  - peer_ip
  - peer_as
  - fsm_state (badge)
  - oper_status (badge)
  - uptime_seconds
  - collected_at
  - freshness
- **Badges**
  - established: verde
  - idle: amarelo
  - active/connect/open*: vermelho
  - unknown: cinza
- **Empty state**
  - "Coleta SNMP BGP ainda nao executada ou expirada."
- **Aviso da tela**
  - "Esta tela mostra estado operacional via SNMP. Nao valida configuracao/policies."

---

## 4) Regras aplicadas

- zero SNMP
- zero SSH
- zero discovery
- zero POST collect na UI
- zero compliance/config snapshot na composicao da tela
- somente GET read-only

---

## 5) Validacoes solicitadas

Comandos solicitados:

- `pnpm typecheck`
- `PORT=24780 BASE_PATH=/ pnpm build`
- smoke bundle/SPA

**Resultado nesta sessao:**

- `pnpm typecheck` — **PASS**
- `PORT=24780 BASE_PATH=/ pnpm build` — **PASS** (netops-manager bundle gerado)
- code scan: somente GET peers/summary; zero POST collect; zero SSH/discovery/compliance imports

---

## 6) Critero GO H3.3

- [x] tela criada
- [x] GET peers
- [x] GET summary
- [x] cards renderizam
- [x] tabela renderiza
- [x] empty state
- [x] zero POST collect
- [x] zero SNMP/SSH/discovery
