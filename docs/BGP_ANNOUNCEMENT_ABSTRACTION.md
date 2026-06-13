# BGP Announcement Matrix — Abstração Operacional

Data: 2026-06-06

## Frase-guia

> Observar primeiro, explicar sempre, simular antes de alterar, aprovar antes de executar, validar depois de aplicar.

## Problema

Analistas precisam responder, por prefixo e upstream:

- Quais saídas estão marcadas (On, P1–P4, Off, BH, NE, Default)?
- Onde a marcação está aplicada (target policy / node)?
- Qual community representa cada upstream?
- A policy upstream **interpreta** corretamente essa community?
- É seguro gerar preview e rollback?

## Domínios

### Announcement Control Domain (modificável)

Onde a **manobra** ocorre:

- `ORIGIN-*` policies (network … route-policy)
- Customer policies que aplicam community / community-list
- Import policies de cliente quando são ponto de marcação

**Regra:** alterações só neste domínio.

### Upstream Audit Domain (audit-only)

Onde a manobra **não** pode ocorrer:

- `Cxx-EXPORT*`, `Cxx-IMPORT*`
- Policies de operadora, CDN, IX, PNI, trânsito
- Policies aplicadas a peers upstream

**Regra:** auditar interpretação; nunca modificar via módulo de manobra.

## Circuito (upstream)

Abstração BGP para fornecedor externo de conectividade:

| Campo | Exemplo |
|-------|---------|
| circuit_id | `"01"`, `"10"`, `"35"` (string, zeros à esquerda) |
| display_name | INFORR, TIM, EBT-MNS, IX.BR BVA |
| role | provider, cdn, ix, pni, transit |
| export_policy | C10-EXPORT-IPV4 |
| community namespace | `64777:5[CID][ACTION]` |

Cliente, iBGP e malha interna **não** são colunas da matriz.

## Community scheme

Formato: `64777:5[CID][ACTION_CODE]`

Exemplo `64777:51003`:

- base ASN: 64777
- namespace: 5 (circuito)
- CID: `"10"`
- action: `"03"` → P2

### Mapeamento UI ↔ action_code

| UI | action_code | prepend_count |
|----|-------------|---------------|
| On | 01 | 0 |
| P1 | 02 | 1 |
| P2 | 03 | 2 |
| P3 | 04 | 3 |
| P4 | 05 | 4 |
| NE | 08 | — |
| Default | 09 | — |
| BH | 66 | — |
| Off | 67 | — |
| — | (ausente) | — |

**Off ≠ sem marcação.** Off exige community explícita 67.

## Matriz

Dimensões:

```text
Target Policy × Prefix scope × Upstream (circuit)
```

Célula = estado observado + evidência + findings.

Upstream policies aparecem na aba **Auditoria de Upstreams**, não como linhas editáveis.

## Fluxo de alteração (MVP)

```text
1. Usuário edita célula (target × upstream × novo estado)
2. Sistema expande prefix-list → prefixos afetados
3. Resolve communities atuais (diretas + community-list)
4. Aplica exclusividade por circuit_id (remove 510xx, insere 51003)
5. Preserva communities desconhecidas e de outros circuitos
6. Busca community-list com match exato → usa apply community community-list
7. Senão → apply community … additive direto
8. Audita upstream export policy para ação desejada
9. Gera diff, script, rollback, risco, findings
10. Não executa (flag OFF)
```

## Entidades persistidas

| Tabela | Papel |
|--------|-------|
| `bgp_upstream_circuits` | Catálogo de circuitos/upstreams por device |
| `bgp_community_action_catalog` | Semântica global de action_code |
| `bgp_announcement_targets` | Targets materializados (origin/customer) |
| `bgp_community_sets` | Community-lists normalizadas (hash + summary) |
| `bgp_announcement_change_plans` | Planos draft (MVP 2) |

Grafo e matriz são **derivados** de `discovery_snapshots.parsed_config` + catálogos.

## Integração com pipeline existente

```text
Connector SSH_CONFIG_BUNDLE
  → discovery_snapshots (parsed_config)
  → bgp-policy-graph.builder
  → announcement-matrix.resolver
  → API / UI
```

Ver também: [BGP_POLICY_GRAPH_MODEL.md](./BGP_POLICY_GRAPH_MODEL.md), [BGP_ANNOUNCEMENT_MATRIX_INTEGRATION_MAP.md](./BGP_ANNOUNCEMENT_MATRIX_INTEGRATION_MAP.md).

## Feature flags

| Flag | Default | Efeito |
|------|---------|--------|
| `BGP_ANNOUNCEMENT_MATRIX_ENABLED` | true | Matriz read-only |
| `BGP_ANNOUNCEMENT_PREVIEW_ENABLED` | true | Preview / change-plan |
| `BGP_ANNOUNCEMENT_EXECUTION_ENABLED` | false | Execução bloqueada |
| `BGP_UPSTREAM_AUDIT_ENABLED` | true | Auditoria Cxx |
| `BGP_COMMUNITY_SET_MATCH_ENABLED` | true | Match exato community-list |
| `BGP_ANNOUNCEMENT_MAX_COLLECTION_AGE_MINUTES` | 30 | Gate de freshness |

## RBAC

| Permissão | viewer | operator | admin |
|-----------|--------|----------|-------|
| `bgp.announcements.read` | ✓ | ✓ | ✓ |
| `bgp.announcements.preview` | | ✓ | ✓ |
| `bgp.announcements.plan` | | ✓ | ✓ |
| `bgp.announcements.refresh` | | ✓ | ✓ |
| `bgp.announcements.approve` | | | ✓ |
| `bgp.announcements.execute` | | | ✓ (flag OFF) |

## Snapshot refresh (fase DATA-SNAPSHOT-REFRESH)

### Recarregar vs Atualizar matriz

| Ação UI | Endpoint | Comportamento |
|---------|----------|---------------|
| **Recarregar** | `GET /bgp/announcements/matrix` (refetch) | Lê o snapshot já salvo — **sem** recompilar |
| **Atualizar matriz** | `POST /bgp/announcements/snapshots/refresh` | Recompila a matriz **somente** a partir de dados persistidos (discovery snapshot, collected_config, catálogos BGP) e grava **novo** registro append-only |

### Regras

- Snapshots em `bgp_announcement_matrix_snapshots` são **append-only** (timelapse).
- Refresh **nunca** chama SSH, SNMP, connector ou discovery runtime.
- Sem apply/write em rede; audit log `announcement_matrix_snapshot_refresh`.
- Tela abre com o último snapshot (`GET .../snapshots/latest` + matrix default).

### Endpoints

| Método | Path | RBAC |
|--------|------|------|
| POST | `/bgp/announcements/snapshots/refresh` | `bgp.announcements.refresh` |
| GET | `/bgp/announcements/snapshots/latest` | `bgp.announcements.read` |
| GET | `/bgp/announcements/snapshots` | `bgp.announcements.read` |
| GET | `/bgp/announcements/snapshots/:id` | `bgp.announcements.read` |
| GET | `/bgp/announcements/matrix?snapshotId=` | `bgp.announcements.read` |

### Validação

```bash
cd workspace && pnpm run typecheck
node tools/bgp-announcement-snapshot-refresh-selftest.mjs
node tools/bgp-announcement-matrix-selftest.mjs   # regressão
```
