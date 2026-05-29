# FASE 2.2 — L2 Circuits NOC UX — Report

**Date:** 2026-05-23  
**Status:** **DONE — read-only UX GO**  
**Route:** `/l2-circuits`

---

## Objetivo

Melhorar usabilidade NOC da tela L2 Circuits (FASE 2.1) sem acoes de rede, discovery, SNMP ou NetBox.

---

## Escopo entregue

| # | Melhoria | Status |
|---|----------|--------|
| 1 | Estado vazio + runbook path | OK |
| 2 | Atualizar lista (refetch API, sem discovery) | OK |
| 3 | Ordenacao NOC (status + findings) | OK |
| 4 | Realce CIRCUIT_DOWN / REMOTE_NOT_FORWARDING | OK |
| 5 | Export CSV filtrado | OK |
| 6 | Filtros em localStorage por user | OK |
| 7 | Responsividade (cards mobile + table desktop) | OK |

---

## Arquivos

### Novos

```
src/features/l2-circuits/l2-circuits-utils.ts       # sort, filters, noc row class, CSV row
src/features/l2-circuits/l2-circuits-filter-storage.ts
src/features/l2-circuits/l2-circuits-export.ts
src/features/l2-circuits/l2-circuits-empty-state.tsx
```

### Alterados

```
src/pages/l2-circuits.tsx
src/features/l2-circuits/l2-circuit-badges.tsx   # NocFindingBadges
```

---

## Detalhe UX

### 1. Estado vazio

- **Sem dados API:** mensagem read-only + discovery controlado via runbook.
- Path textual: `docs/l2-circuits/RUNBOOK_L2_DISCOVERY.md` (app nao serve docs — referencia repo).
- **Com dados, filtros vazios:** estado separado "Nenhum circuito com filtros atuais".

### 2. Refresh

- Botao **Atualizar lista** → `refetch()` TanStack Query.
- So relê `GET /api/l2-circuits` — zero SSH/discovery.

### 3. Ordenacao

Prioridade `operStatus`:

1. DOWN  
2. PARTIAL  
3. CONFIG_ONLY  
4. UP  
5. UNKNOWN  

Desempate: `findings.length` desc, depois `name`.

### 4. Realce NOC

- Linha: borda/fundo vermelho se `CIRCUIT_DOWN`; ambar se `REMOTE_NOT_FORWARDING`.
- Badges inline: **Circuit DOWN**, **Remote N/F**.
- Findings count mantem cor por severidade.

### 5. Export CSV

- Botao **Export CSV** — dataset **filtrado + ordenado** visivel.
- Colunas: device, type, status, vlan, vc_id, vsi_name, local_interface, peer_ip, findings_count, last_seen.
- **Sem** raw_evidence.

### 6. Persistencia filtros

- Key: `netops:l2-circuits-filters:{userId|anonymous}`.
- Campos: device, type, status, vlan, vc_id, peer.
- Limpar filtros apaga storage.

### 7. Responsividade

- **&lt; md:** cards clicaveis (mesmo sort/highlight).
- **≥ md:** tabela scroll horizontal, colunas menos criticas ocultas em lg/xl.
- ID coluna sticky esquerda.
- Detail sheet inalterado (sm:max-w-2xl).

---

## Validacao

```bash
cd workspace/artifacts/netops-manager
pnpm run typecheck                    # OK
PORT=24780 BASE_PATH=/ pnpm run build # OK
```

---

## Fora de escopo (confirmado)

- discover button
- SSH / L2_DISCOVER_SSH_ENABLED
- backend discovery changes
- SNMP / NetBox
- paginacao server-side

---

## Veredito

**FASE 2.2 GO** — NOC L2 consulta mais operavel: vazio claro, sort NOC, highlight, CSV, filtros persistentes, mobile OK.
