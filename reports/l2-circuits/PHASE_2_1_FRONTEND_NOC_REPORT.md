# FASE 2.1 — Frontend NOC L2 Circuits — Report

**Date:** 2026-05-23  
**Status:** **DONE — read-only consulta GO**  
**Route:** `/l2-circuits`

---

## Objetivo

Tela NOC para **consulta** de circuitos L2 já descobertos (MVP FASE 1 encerrado). Sem discovery, SSH, SNMP, NetBox ou bulk.

---

## Escopo entregue

| Item | Status |
|------|--------|
| Listar circuitos | ✅ |
| Filtrar device_id | ✅ (API query) |
| Filtrar circuit_type, status, VLAN, VC-ID, peer_ip | ✅ (client-side) |
| Badges status / tipo | ✅ |
| Findings count | ✅ |
| Detalhe circuito (sheet) | ✅ |
| raw_evidence redigida | ✅ |
| run_id / last_seen | ✅ |
| Diferenciar vlan_local vs l2vc/vpws vs vsi/vpls | ✅ (badges + colunas + campos condicionais) |
| Nav sidebar + rota | ✅ |
| typecheck | ✅ |
| build | ✅ |

---

## Arquivos criados / alterados

### Novos

```
workspace/artifacts/netops-manager/src/features/l2-circuits/
  l2-circuits-api.ts          # types + fetch + react-query hooks
  l2-circuit-badges.tsx       # status/type/findings badges
  l2-circuit-detail-sheet.tsx # sheet detalhe read-only

workspace/artifacts/netops-manager/src/pages/
  l2-circuits.tsx             # página NOC principal
```

### Alterados

```
workspace/artifacts/netops-manager/src/App.tsx           # Route /l2-circuits
workspace/artifacts/netops-manager/src/components/layout.tsx  # nav "L2 Circuits"
```

---

## UI — comportamento

### Lista (`/l2-circuits`)

- **Cards resumo:** total filtrado, família (Local / MPLS / VSI), UP/DOWN, com findings.
- **Filtros:**
  - `device_id` → refetch API `GET /api/l2-circuits?device_id=N`
  - `circuit_type`, `oper status`, VLAN, VC-ID, peer IP → filtro local sobre dataset carregado
- **Tabela:** ID, device (hostname), tipo, nome, interface, VLAN/VC/VSI, peer, status badge, findings count, last_seen, ação olho.
- **Refresh** manual (sem auto-poll discovery).

### Detalhe (Sheet)

- Badges tipo + oper status + ID
- Campos por família:
  - **vlan_local:** outer/inner VLAN, interface
  - **l2vc/vpws:** VC-ID, peer IP, PW status
  - **vsi/vpls:** VSI name/ID, peer IP
- `discoveryRunId`, `firstSeen`, `lastSeen`
- Lista findings (code, severity, message)
- `rawEvidence` em `<pre>` (redigido na coleta)

---

## API consumida (read-only)

| Método | Endpoint | Uso |
|--------|----------|-----|
| GET | `/api/l2-circuits` | lista |
| GET | `/api/l2-circuits?device_id=N` | lista por device |
| GET | `/api/l2-circuits/:id` | detalhe sheet |

**Não usado:** `POST /api/l2-circuits/discover`, jobs, SSH.

---

## Limitações conhecidas (herdadas MVP)

1. API list aplica **um filtro server-side por vez** (if/else) — UI compensa com filtros client-side.
2. `total` na resposta = length do array retornado, não paginação DB.
3. Findings attach por substring no nome (ex.: `L2VC-15` pode pegar `L2VC-1548`) — backlog backend.
4. Dataset grande (261+ circuitos devices 1+2) carrega inteiro no browser — OK para piloto; paginação = fase futura.

---

## Validação build

```bash
cd workspace/artifacts/netops-manager
pnpm run typecheck                    # OK
PORT=24780 BASE_PATH=/ pnpm run build # OK (vite 7.3.3, 1892 modules)
```

Node local 20.18.2 emite warning Vite (requer 20.19+); build completou. CI/Docker usa Node 24.

---

## Fora de escopo (confirmado)

- ❌ Botão discover / trigger SSH
- ❌ `L2_DISCOVER_SSH_ENABLED=true`
- ❌ Bulk discovery
- ❌ SNMP / NetBox sync
- ❌ Edição circuito

---

## Próximos passos sugeridos (FASE 2.2+)

1. Paginação server-side + filtros combinados na API
2. Link device hostname → `/devices/:id`
3. Agrupamento por `discoveryRunId` / freshness
4. Botão discover (operador) com guardrails do RUNBOOK — **só após aprovação explícita**

---

## Veredito

**FASE 2.1 GO** — frontend NOC read-only operacional para consulta de circuitos L2 descobertos no MVP.
