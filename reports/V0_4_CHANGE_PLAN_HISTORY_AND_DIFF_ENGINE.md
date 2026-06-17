# V0.4 — Change Plan History, Impact Snapshot, Diff Engine

Data: 2026-06-06  
Escopo: documentação, persistência, versionamento, diff e rollback **documental** — **sem execução em dispositivos**.

---

## 1. Problema atual

Antes desta entrega, o **BGP Cleanup Planner** persistia análises em `bgp_peer_cleanup_analyses`, mas:

- Não havia modelo genérico reutilizável por outros módulos (Provisioning, L2VPN, Announcement Matrix).
- Não existia snapshot estruturado de impacto (before/after) nem diff padronizado.
- Rollback era implícito (operador inferia manualmente) — sem bloqueio de export quando inválido.
- Histórico por device/peer não era consultável de forma unificada.
- Auditoria limitada a eventos BGP (`bgp_cleanup_analysis_created`, `bgp_cleanup_script_exported`).

Isso impedia responder de forma consistente: *o que existia antes?*, *o que seria removido?*, *qual rollback documental?*, *quem visualizou/exportou?*

---

## 2. Objetivo

Transformar **toda alteração planejada** (começando pelo BGP Cleanup) em um **Change Plan** auditável:

| Capacidade | Entrega |
|------------|---------|
| Snapshot completo ao abrir planejamento | Sim — persistido mesmo em visualização |
| Classificação EXCLUSIVE / SHARED / GLOBAL / AMBIGUOUS por item | Sim — `change_plan_items` |
| Diff ADDED / REMOVED / CHANGED / UNCHANGED | Sim — motor genérico |
| Rollback documental (sem apply) | Sim — bloqueia export se `invalid` |
| Endpoints históricos | Sim — `/api/change-plans*` |
| UI de detalhes (ⓘ) | Sim — modal no BGP Cleanup |
| Auditoria global | Sim — `change_plan_*` em `audit_logs` |

**Restrições mantidas:** nenhum comando executado, nenhum apply, nenhuma alteração de rede.

---

## 3. Arquitetura

```
┌─────────────────────┐     adapter      ┌──────────────────────────┐
│  BGP Cleanup        │ ───────────────► │  change-plans module     │
│  (peer_removal)     │                  │  - createChangePlan      │
└─────────────────────┘                  │  - diff engine           │
                                         │  - rollback doc          │
┌─────────────────────┐     (futuro)     │  - markdown/json export  │
│ Provisioning / L2 / │ ───────────────► └───────────┬──────────────┘
│ Announcements       │                              │
└─────────────────────┘                              ▼
                                         ┌──────────────────────────┐
                                         │ Postgres                 │
                                         │ change_plans             │
                                         │ change_plan_snapshots    │
                                         │ change_plan_items        │
                                         │ change_plan_diffs        │
                                         └──────────────────────────┘
```

**Padrão de extensão:** cada módulo implementa um *adapter* que produz `ChangePlanCreateInput` (snapshot, items, before/after state, rollback). O serviço central persiste e expõe API/UI.

Arquivos principais:

| Componente | Caminho |
|------------|---------|
| Schema Drizzle | `workspace/lib/db/src/schema/change_plans.ts` |
| Migration | `workspace/lib/db/migrations/0042_change_plans_history.sql` |
| Diff engine | `workspace/artifacts/api-server/src/modules/change-plans/change-plans.diff-engine.ts` |
| Service | `workspace/artifacts/api-server/src/modules/change-plans/change-plans.service.ts` |
| BGP adapter | `workspace/artifacts/api-server/src/modules/change-plans/adapters/bgp-cleanup.adapter.ts` |
| Routes | `workspace/artifacts/api-server/src/modules/change-plans/change-plans.routes.ts` |
| UI detalhes | `workspace/artifacts/netops-manager/src/features/change-plans/change-plan-details-modal.tsx` |
| Selftest | `tools/change-plans-selftest.mjs` |

---

## 4. Modelo de banco

### `change_plans`
| Coluna | Descrição |
|--------|-----------|
| `module` | Ex.: `bgp_cleanup`, `provisioning`, `l2vpn` |
| `change_type` | Ex.: `peer_removal` |
| `device_id` | FK devices |
| `status` | `draft` \| `valid` \| `invalid` \| `exported` \| `closed` |
| `source_object_type/id` | Link opcional (ex.: `bgp_cleanup_analysis/123`) |
| `metadata_json` | peer_ip, recommendation, risk, hostname |

### `change_plan_snapshots`
Snapshot JSON completo: peer, policies, prefix-lists, community-filters, script, rollback, validações, findings, impacto.

### `change_plan_items`
Um registro por objeto analisado:
- `item_type`, `item_name`
- `classification` (exclusive/shared/global/ambiguous)
- `usage_count`, `will_be_removed`, `reason`
- `users_json` (quem usa)

### `change_plan_diffs`
- `before_json` / `after_json` — estados simulados
- `rollback_json` — script/steps/dependencies/warnings
- `diff_json` — resultado ADDED/REMOVED/CHANGED/UNCHANGED

---

## 5. Fluxo operacional (BGP Cleanup)

1. Operador abre **Planejamento de Remoção** → `POST .../cleanup/analyze`.
2. API gera análise BGP + script (como antes).
3. **Novo:** adapter BGP monta Change Plan e persiste snapshot/items/diff/rollback.
4. Resposta inclui `changePlanId`.
5. Operador clica **ⓘ** → `GET /api/change-plans/:id` + audit `change_plan_viewed`.
6. Export Markdown → via Change Plan; bloqueado se `status=invalid` (rollback indisponível).

Mesmo que o operador **apenas visualize**, o histórico fica gravado.

---

## 6. UI proposta

### Modal principal (existente)
- Script, validações, buckets EXCLUSIVE/SHARED/GLOBAL/AMBIGUOUS.

### Botão ⓘ (novo)
Ao lado de Copiar Script / Exportar Markdown / Atualizar SSH.

### Modal **Detalhes do Change Plan**
Seções:
- Peer
- Route-policies
- Prefix-lists
- Community-filters / lists
- As-path filters
- Globais preservados

Por item:
- Nome, tipo, classificação, usage count, usuários, **Será removido: SIM/NÃO**, motivo.

Também exibe diff (REMOVED/ADDED/CHANGED/UNCHANGED) e rollback documental.

---

## 7. Integração com BGP Cleanup Planner

- `analyzeBgpPeerCleanup` chama `createChangePlan` após persistir análise.
- `analysis.changePlanId` retornado ao frontend.
- Export BGP delega ao Change Plan quando `changePlanId` presente.
- Eventos de auditoria:
  - `change_plan_created`
  - `change_plan_viewed`
  - `change_plan_exported`
  - (futuro) `change_plan_updated`, `change_plan_closed`

---

## 8. Integração com Provisioning (futuro)

Adapter previsto:

```typescript
buildChangePlanInputFromProvisioningPreview(preview) → ChangePlanCreateInput
```

Reutiliza:
- diff engine (before=current snapshot, after=preview target)
- rollback documental (template inverse / baseline restore notes)
- export Markdown/JSON para ticket

Provisioning v0.4.x deve **apenas** registrar preview como Change Plan — apply engine continua desabilitado.

---

## 9. Integração com Announcement Matrix (futuro)

`bgp_announcement_change_plans` existente pode migrar para o modelo genérico:

- `module=bgp_announcements`
- `change_type=community_matrix_update`
- Items = community sets / targets afetados
- Diff = matriz before/after por circuito/upstream

Audit-only permanece; execução bloqueada por flag.

---

## 10. Estratégia de rollback documental

Rollback **nunca executa**. Estrutura:

```json
{
  "valid": true,
  "script": ["system-view", "bgp 268707", "peer X as-number Y", "..."],
  "steps": [{ "order": 1, "action": "restore-peer", "target": "..." }],
  "dependencies": [{ "type": "route-policy", "name": "..." }],
  "warnings": ["Restaurar definição completa a partir do snapshot"]
}
```

Regras:
- BGP peer removal: restaurar peer + policies exclusivas (referência snapshot).
- Sem `remote-as` ou plano `skip` → `valid=false`, `status=invalid`, **export bloqueado (409)**.
- Globais (DEFAULT, Cxx-RECEIVED) **nunca** entram no rollback de remoção.

---

## 11. Critérios de aceite

| Critério | Status |
|----------|--------|
| Snapshot persistido ao analisar peer (mesmo só visualizar) | ✅ |
| Tabelas genéricas change_plans* | ✅ migration 0042 |
| Diff ADDED/REMOVED/CHANGED/UNCHANGED | ✅ + selftest |
| Rollback documental com bloqueio de export | ✅ |
| GET /api/change-plans, /:id, /:id/diff, /:id/export, /device/:id | ✅ |
| Modal ⓘ com detalhes por item | ✅ |
| Auditoria change_plan_* | ✅ |
| Nenhuma execução SSH/apply adicional | ✅ |
| typecheck + selftests | ✅ |

---

## 12. Próximas fases

1. **OpenAPI** — expor Change Plans no contrato Orval.
2. **Página histórica** — `/devices/:id/change-history` listando planos.
3. **Adapters** — Provisioning preview, L2VPN, VRF, Interface.
4. **Ticket ref** — campo `ticket_ref` editável pós-criação.
5. **HTML export** — template renderizado.
6. **Diff visual** — side-by-side na UI.
7. **Migração** — unificar `bgp_announcement_change_plans` no modelo genérico.
8. **Apply engine (v1+)** — consumir Change Plan validado; fora do escopo atual.

---

## API — referência rápida

| Método | Rota | Permissão |
|--------|------|-----------|
| GET | `/api/change-plans` | `devices.read` |
| GET | `/api/change-plans/device/:id` | `devices.read` |
| GET | `/api/change-plans/:id` | `devices.read` |
| GET | `/api/change-plans/:id/diff` | `devices.read` |
| POST | `/api/change-plans/:id/export` | `bgp.cleanup.plan` |
| POST | `/api/change-plans/:id/close` | `bgp.cleanup.plan` |

Export body: `{ "format": "markdown" | "json" }`

---

## Validação executada

```bash
cd workspace && pnpm run typecheck
node tools/change-plans-selftest.mjs
node tools/bgp-peer-cleanup-planner-selftest.mjs
tools/apply-containers.sh api web
```

Nenhum comando de configuração foi aplicado em equipamentos.
