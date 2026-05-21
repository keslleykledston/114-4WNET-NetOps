# FASE 4.y — BGP UX Parity Report

Data: 2026-05-20

Referencia comportamental: `60-bgp_manager` (BGPPanel.jsx). Design 114 preservado.

## Escopo entregue

### 1. Address Family filter (frontend)

- Select: Todos | IPv4 | IPv6 | Unknown
- `ipv4`/`ipv6` → query `?af=` no backend
- `unknown` → filtro client-side em `peer.addressFamily`

### 2. State filter — Down

- Opcao **Down / Not Established** adicionada
- Regra: `state !== Established`
- Backend: `?state=Down` via `filterBgpPeers` (ja existia)

### 3. Filter persistence per device

- Chave: `netops:bgp-filters:<deviceId>`
- Persiste: search, stateFilter, roleFilter, afFilter, includeIbgp
- Restaura ao trocar dispositivo (views com `role` fixo da arvore ignoram roleFilter salvo)

### 4. Operational tree — BGP subnodes

Novos nos em `netops-tree`:

| View | Label | Role API |
|------|-------|----------|
| bgp | BGP (Todos) | — |
| bgp-providers | Operadoras | provider |
| bgp-customers | Clientes | customer |
| bgp-cdn | CDN | cdn |
| bgp-ix | IX | ix |
| bgp-cdn-ix | CDN/IX | cdn_ix |
| bgp-ibgp | iBGP | ibgp |
| bgp-unknown | Unknown | unknown |

`netops-operations.tsx` passa `role` ao `BgpPanel` por no.

### 5. Peer actions — Sheet read-only

- Novo: `bgp-peer-sheet.tsx`
- Substitui toasts por Sheet lateral
- Acoes: Detalhes, Prefixos recebidos/exportados, Policies, Communities, Diagnostico
- Hooks: `useGetNetopsDeviceBgpPeer`, prefix lists, policies, communities, diagnostics
- Empty state quando `[]` ou stub message

### 6. Counters — expand

12 contadores: total, established, down, eBGP, iBGP, Clientes, Operadoras, IX, CDN, CDN/IX, Unknown, IPv4, IPv6

## Arquivos alterados

```
workspace/artifacts/netops-manager/src/features/bgp/bgp-panel.tsx
workspace/artifacts/netops-manager/src/features/bgp/bgp-peer-sheet.tsx   (novo)
workspace/artifacts/netops-manager/src/features/netops-tree/types.ts
workspace/artifacts/netops-manager/src/features/netops-tree/netops-tree.tsx
workspace/artifacts/netops-manager/src/pages/netops-operations.tsx
docs/netops/BGP_OPERATIONAL_ABSTRACTIONS.md
reports/migration/FUTURE_PHASE_TODOS.md
reports/migration/PHASE_4Y_BGP_UX_PARITY_REPORT.md
```

## Validacao

```bash
cd workspace && pnpm run typecheck
BASE_PATH=/ PORT=5000 pnpm run build
bash tools/netops-audit.sh
bash tools/apply-containers.sh api web   # se containers rebuild
```

### Smoke (Docker)

| Check | Resultado |
|-------|-----------|
| GET bgp-peers | 200 — peers JSON ok |
| GET ?state=Down / ?af=ipv4 | 200 |
| PUT role override | 200 — `ok:true` |
| GET /netops-operations | 200 |
| localStorage filters | teste manual no browser |

### Teste manual localStorage

1. Abrir `/netops-operations` → device → BGP
2. Ajustar busca, estado Down, AF IPv6, papel, iBGP
3. Trocar device e voltar — filtros devem restaurar
4. DevTools → Application → Local Storage → `netops:bgp-filters:<id>`

## Gaps / proximo

- FASE 5: coleta SNMP/SSH real, prefixos/policies com dados vivos
- Subnos IPv4/IPv6 por papel na arvore (60 tem; 114 usa filtro AF no painel)
- FASE 4.1: favicon K3G

## Regras respeitadas

- Sem config router, SSH/SNMP real, system-view/commit/save
- Sem mudanca layout global / tailwind theme
- Sem novo backend write (so role override existente)
- `/netops-operations` intacto
