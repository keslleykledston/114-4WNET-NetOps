# BGP Announcement Matrix — MVP Read-Only Closure

**Data:** 2026-06-13  
**Branch:** `codex/bgp-peer-dedupe`  
**Status:** ✅ MVP read-only fechado — validado em runtime (device 94)

Documento oficial de encerramento da fase read-only da BGP Announcement Matrix. Nenhuma execução em device, apply ou Controlled Execution faz parte deste MVP.

---

## 1. Resumo executivo

A BGP Announcement Matrix entrega um fluxo **observar → explicar → simular → solicitar mudança (draft)**, totalmente read-only:

- Matriz prefixo × upstream construída a partir de **dados persistidos** (discovery snapshot / collected config).
- **Semantic View** separa Cliente/ORIGIN editável, upstreams em auditoria, globais protegidos e conflitos reais.
- **Change Preview** gera diff lógico + ticket Markdown sem executar comandos.
- **Draft Change Plan** formaliza o preview em `change_plans` com status `draft` — não é aprovação nem execução.

Runtime smoke test concluído em **device 94** (`4WNET-BVA-BRT-RB`), snapshot **193**, previews **5–8**, plans **27–28**. API/Web healthy, typecheck OK, migrations aplicadas.

---

## 2. Escopo entregue

| Fase | Entrega | Status |
|------|---------|--------|
| Foundation | Schema matrix, resolver, API read-only, UI base | ✅ |
| API/UI wiring | Rotas, RBAC, gates, netops-manager panel | ✅ |
| Snapshot refresh | `POST .../snapshots/refresh` — `database_only` | ✅ |
| Semantic View | `semanticView` no read model + tabs UI | ✅ |
| Change Preview | Persistência + ticket markdown + validações | ✅ |
| Change Plan Link | Preview → draft `change_plans` | ✅ |
| Change Plan Review | Workflow documental (submit/reject/approve manual) | ✅ |
| Change Plan Review Closure | Smoke runtime #28 + doc oficial | ✅ |
| Snapshot Timelapse Diff | Comparação read-only entre snapshots | ✅ |
| Snapshot Timelapse Diff Closure | Smoke runtime 192→193 + doc oficial | ✅ |
| Runtime smoke | API + UI end-to-end device 94 | ✅ |

**Fora de escopo (MVP read-only):** apply, execute, Controlled Execution, SSH/SNMP/connector no fluxo da matriz, edição de upstream/provider/IX/CDN, remoção de globais protegidos.

---

## 3. Arquitetura final

```
discovery_snapshots / collected_configs (DB)
        │
        ▼
refreshAnnouncementMatrixSnapshot()  ── database_only, append-only
        │
        ▼
bgp_announcement_matrix_snapshots (rows_json + meta_json)
        │
        ├── getAnnouncementMatrix() + semanticView enrich
        ├── runUpstreamAudit()  (audit_only domain)
        │
        ▼
createAnnouncementChangePreview()  ── read-only compiler
        │
        ▼
bgp_announcement_change_previews
        │
        ▼
createChangePlanFromPreview()  ── draft only
        │
        ▼
change_plans (+ snapshots, diffs, items)

        ▼ (read-only, paralelo)
computeAnnouncementSnapshotDiff()  ── timelapse entre matrix snapshots
```

### Componentes

| Camada | Módulo / artefato |
|--------|-------------------|
| Snapshot refresh | `announcement-matrix.service.ts` → `refreshAnnouncementMatrixSnapshot` |
| Matrix read model | `getAnnouncementMatrix`, `getMatrixSnapshotById` |
| Semantic View | `semantic-matrix-view.service.ts`, `semantic-dependency-classifier.ts` |
| Change Preview | `announcement-change-preview.service.ts` |
| Draft Change Plan | `announcement-change-plan-link.service.ts` + adapter `bgp-announcement-preview.adapter.ts` |
| UI | `AnnouncementPanel`, `AnnouncementMatrixTable`, `ChangePreviewModal`, tabs semânticas |
| Audit | `logAuditEvent`: `announcement_matrix_snapshot_refresh`, `announcement_change_preview_created`, `announcement_change_plan_draft_created` |
| RBAC | `bgp.announcements.read` / `.refresh` / `.preview` / `.plan` |

---

## 4. Fluxo operacional validado

1. **Abrir BGP Announcements** — `/netops-operations?view=bgp-announcements&deviceId=94` ou `/bgp-announcements`.
2. **Carregar último snapshot** — GET `/api/bgp/announcements/snapshots/latest?deviceId=94`.
3. **Atualizar matriz** (opcional) — POST `/api/bgp/announcements/snapshots/refresh` `{ "deviceId": 94 }` → novo snapshot append-only (193 após refresh validado).
4. **Abrir tabs semânticas** — Clientes/ORIGIN, Auditoria Upstreams, Dependências Globais, Conflitos, Histórico.
5. **Gerar Change Preview** — botão **Gerar preview** em row `editable_future`; modal com ticket markdown.
6. **Criar Draft Change Plan** — **Criar plano de mudança** (ack se risk `high`); link **Ver plano** → status `draft`.

---

## 5. Segurança

| Regra | Implementação |
|-------|---------------|
| Read-only | `meta.readOnly: true`; refresh `database_only`; sem apply |
| Sem SSH | Módulo não chama collectors SSH |
| Sem SNMP | Refresh não dispara poll SNMP |
| Sem connector | Nenhuma rota announcements invoca connector jobs |
| Sem apply | `BGP_ANNOUNCEMENT_EXECUTION_ENABLED=false`; UI sem botão apply/execute |
| Sem Controlled Execution | Preview/plan não chamam provisioning apply |
| Upstream audit_only | Export/upstream fora da matriz editável; aba Auditoria |
| Protected globals | `protectedGlobals` na semanticView; remoção bloqueada no preview |

---

## 6. Migrations

| Migration | Conteúdo |
|-----------|----------|
| `0041_bgp_announcement_matrix.sql` | Base matrix (targets, observed, catálogos) |
| `0042_change_plans_history.sql` | `change_plans`, snapshots, diffs, items |
| `0043_bgp_announcement_targets_target_type.sql` | `target_type` em targets |
| `0045_bgp_announcement_matrix_snapshots.sql` | Snapshots materializados append-only |
| `0049_bgp_announcement_change_previews.sql` | Change previews persistidos |
| `0050_bgp_preview_change_plan_link.sql` | FK `change_plan_id` em previews |

Todas aplicadas em lab (`migrate:safe` → `Applied 0 pending`).

---

## 7. Endpoints principais

| Método | Path | RBAC |
|--------|------|------|
| GET | `/api/bgp/announcements/feature` | `read` |
| GET | `/api/bgp/announcements/snapshots/latest` | `read` |
| GET | `/api/bgp/announcements/snapshots` | `read` |
| GET | `/api/bgp/announcements/snapshots/diff` | `read` |
| GET | `/api/bgp/announcements/snapshots/timeline` | `read` |
| GET | `/api/bgp/announcements/snapshots/:id/diff-latest` | `read` |
| POST | `/api/bgp/announcements/snapshots/refresh` | `refresh` |
| GET | `/api/bgp/announcements/matrix` | `read` |
| POST | `/api/bgp/announcements/change-preview` | `preview` |
| GET | `/api/bgp/announcements/change-preview/:id` | `read` |
| POST | `/api/bgp/announcements/change-preview/:id/create-plan` | `plan` |
| GET | `/api/bgp/announcements/change-preview/:id/plan` | `read` |
| GET | `/api/bgp/announcements/change-plans?previewId=` | `read` |
| GET | `/api/bgp/upstreams/audit` | `read` |

Documentação detalhada: [Change Preview](./BGP_ANNOUNCEMENT_CHANGE_PREVIEW.md), [Change Plan Link](./BGP_ANNOUNCEMENT_CHANGE_PLAN_LINK.md), [Snapshot Timelapse Diff](./BGP_ANNOUNCEMENT_SNAPSHOT_TIMELAPSE_DIFF.md), [Snapshot Timelapse Diff Closure](./BGP_ANNOUNCEMENT_SNAPSHOT_TIMELAPSE_DIFF_CLOSURE.md).

---

## 8. UI

| Elemento | Comportamento |
|----------|---------------|
| **Clientes / ORIGIN** | Matriz editável futura; botão **Gerar preview** |
| **Auditoria Upstreams** | Read-only; sem preview editável |
| **Dependências Globais** | Lista `protected_global` |
| **Conflitos** | Apenas conflitos reais (não globais compartilhados) |
| **Histórico** | Snapshots append-only; comparação timelapse read-only |
| **Change Preview Modal** | Ticket markdown, diff lógico, copiar/baixar |
| **Draft Change Plan** | Badge + link `/change-plans?highlight=`; workflow de revisão; sem execute |

Banner: *"Read-only — origin/cliente para edição futura; upstreams só em auditoria. Sem SSH/SNMP neste painel."*

---

## 9. RBAC

| Permissão | viewer | operator | admin |
|-----------|--------|----------|-------|
| `bgp.announcements.read` | ✅ | ✅ | ✅ |
| `bgp.announcements.refresh` | ❌ | ✅ | ✅ |
| `bgp.announcements.preview` | ❌ | ✅ | ✅ |
| `bgp.announcements.plan` | ❌ | ✅ | ✅ |

Ninguém possui rota de execução neste MVP.

---

## 10. Dados persistidos usados

| Fonte | Uso |
|-------|-----|
| `discovery_snapshots` | Config parseada + policy dependency graph |
| `collected_configs` | Fallback quando discovery ausente |
| Catálogos (`bgp_announcement_*`) | Upstreams, communities, targets |
| `bgp_announcement_matrix_snapshots` | Matriz materializada + semantic enrich |
| `bgp_announcement_change_previews` | Previews append-only |
| `change_plans` (+ snapshots/diffs) | Draft plans linkados ao preview |

---

## 11. Smoke test runtime (2026-06-13)

| Item | Valor |
|------|-------|
| Device | **94** — `4WNET-BVA-BRT-RB` |
| Snapshot | **193** (refresh append-only a partir de 192) |
| Matrix rows | 2× `customer` / `editable_future` |
| Semantic | 15 `protectedGlobals`; `realConflicts: []` |
| Preview IDs | **5** (high), **7** (medium), **8** (UI) |
| Plan IDs | **27** (API ack high), **28** (UI) |
| Feature flags | `enabled`, `previewEnabled`, `upstreamAuditEnabled` = **true** |
| Typecheck | `pnpm run typecheck` — **OK** |
| API/Web | `:8085` healthy, `:3005` 200 |
| Security grep | Rotas `/api/bgp/announcements/*` — sem ssh/snmp/connector/apply |

Selftests (CI parity):

```bash
node tools/bgp-announcement-matrix-selftest.mjs
node tools/bgp-announcement-semantic-view-selftest.mjs
node tools/bgp-announcement-snapshot-refresh-selftest.mjs
node tools/bgp-announcement-change-preview-selftest.mjs      # 14/14
node tools/bgp-announcement-change-plan-link-selftest.mjs    # 12/12
node tools/bgp-announcement-snapshot-timelapse-diff-selftest.mjs
```

---

## 12. Critérios de aceite (concluídos)

- [x] Matriz carrega último snapshot persistido
- [x] Refresh cria snapshot append-only (`database_only`)
- [x] Semantic View: roles, scopes, globais, conflitos reais
- [x] Cliente/ORIGIN `editable_future`; upstream/provider/IX/CDN audit_only
- [x] Change Preview persiste com ticket markdown e diff lógico
- [x] Preview bloqueado para audit_only / export / globais como alvo
- [x] Draft Change Plan com `sourceObjectType=bgp_announcement_change_preview`
- [x] Status `draft` — sem execução
- [x] UI sem apply/execute/aprovar execução
- [x] Sem SSH/SNMP/connector/Controlled Execution no fluxo
- [x] Typecheck OK; API/Web buildam
- [x] Migrations 0041–0043, 0045, 0049, 0050 aplicadas

---

## 13. Limitações conhecidas

- **Não executa** — preview e plan são documentação operacional.
- **Não altera config** — depende 100% de dados já persistidos no DB.
- **Idade da coleta** — warning quando discovery > `BGP_ANNOUNCEMENT_MAX_COLLECTION_AGE_MINUTES` (default 30 min).
- **Upstreams** — apenas auditoria; rows `audit_only` podem ser 0 quando export está na aba separada.
- **`set_prepend` / `clear_prepend`** — `unsupported_preview` nesta fase.
- **Rollback** — documental em metadata; apply/rollback automático é fase futura.
- **Device sem discovery** — refresh retorna `422 NO_PERSISTED_DATA`.

---

## 14. Próximas fases recomendadas

1. **Change Plan Review Workflow** — ✅ entregue e fechado. Ver [`CHANGE_PLANS_REVIEW_WORKFLOW_CLOSURE.md`](./CHANGE_PLANS_REVIEW_WORKFLOW_CLOSURE.md).
2. **Controlled Execution Adapter** — somente após flags explícitas + RBAC `execute`.
3. **Richer policy compiler** — prepend, export edge cases, large-community.
4. **Timelapse / diff entre snapshots** — ✅ entregue e fechado. Ver [`BGP_ANNOUNCEMENT_SNAPSHOT_TIMELAPSE_DIFF.md`](./BGP_ANNOUNCEMENT_SNAPSHOT_TIMELAPSE_DIFF.md) e [`BGP_ANNOUNCEMENT_SNAPSHOT_TIMELAPSE_DIFF_CLOSURE.md`](./BGP_ANNOUNCEMENT_SNAPSHOT_TIMELAPSE_DIFF_CLOSURE.md).
5. **Integração ticket externo** — Jira/GLPI a partir do ticket markdown.

---

## 15. Checklist operacional (uso seguro)

- [ ] API/Web healthy (`docker compose ps`)
- [ ] Migrations aplicadas (`pnpm --filter @workspace/db run migrate:safe`)
- [ ] Feature enabled (`GET /api/bgp/announcements/feature`)
- [ ] Snapshot atualizado (`Atualizar matriz` ou POST refresh)
- [ ] Semantic tabs revisadas (Clientes, Auditoria, Globais, Conflitos)
- [ ] Preview gerado **apenas** em Cliente/ORIGIN editável
- [ ] Upstreams revisados como auditoria (aba dedicada)
- [ ] Protected globals revisados (aba Dependências Globais)
- [ ] Ticket markdown gerado com *"Nenhum comando foi executado."*
- [ ] Draft Change Plan criado (se necessário); status `draft`
- [ ] Nenhum botão apply/execute disponível na UI
- [ ] Logs sem SSH/SNMP/connector no fluxo BGP Announcements

---

## 16. Smoke test manual (repetição)

Pré-requisitos: `ADMIN_EMAIL` / `ADMIN_PASSWORD` no `.env`; API `:8085`, Web `:3005`.

```bash
cd workspace && pnpm run typecheck

# Feature
curl -s -b "netops_session=$TOKEN" http://127.0.0.1:8085/api/bgp/announcements/feature

# Snapshots (device 94)
curl -s -b "netops_session=$TOKEN" \
  "http://127.0.0.1:8085/api/bgp/announcements/snapshots/latest?deviceId=94"

curl -s -X POST -H "Content-Type: application/json" -b "netops_session=$TOKEN" \
  -d '{"deviceId":94}' \
  http://127.0.0.1:8085/api/bgp/announcements/snapshots/refresh

# Matrix
curl -s -b "netops_session=$TOKEN" \
  "http://127.0.0.1:8085/api/bgp/announcements/matrix?deviceId=94&snapshotId=SNAPSHOT_ID"

# Change preview (target editable_future + upstreamCircuitId)
curl -s -X POST -H "Content-Type: application/json" -b "netops_session=$TOKEN" \
  -d '{"deviceId":94,"snapshotId":SNAPSHOT_ID,"targetId":"TARGET_KEY","actionType":"add_community","upstreamCircuitId":"15","community":"64777:51501"}' \
  http://127.0.0.1:8085/api/bgp/announcements/change-preview

# Draft plan (ack se risk high)
curl -s -X POST -H "Content-Type: application/json" -b "netops_session=$TOKEN" \
  -d '{"acknowledgeHighRisk":true}' \
  http://127.0.0.1:8085/api/bgp/announcements/change-preview/PREVIEW_ID/create-plan

# UI
open http://localhost:3005/netops-operations?view=bgp-announcements&deviceId=94
```

Selftests rápidos:

```bash
node tools/bgp-announcement-change-preview-selftest.mjs
node tools/bgp-announcement-change-plan-link-selftest.mjs
```

Segurança (logs):

```bash
docker compose logs api | rg "/api/bgp/announcements" | rg -i "ssh|snmp|connector|controlled|execute|apply" || echo OK
```

---

## Referências

- [Abstração operacional](./BGP_ANNOUNCEMENT_ABSTRACTION.md)
- [Integration map](./BGP_ANNOUNCEMENT_MATRIX_INTEGRATION_MAP.md)
- [Policy graph model](./BGP_POLICY_GRAPH_MODEL.md)
- [Change Preview](./BGP_ANNOUNCEMENT_CHANGE_PREVIEW.md)
- [Change Plan Link](./BGP_ANNOUNCEMENT_CHANGE_PLAN_LINK.md)
- [Change Plan Review Workflow](./BGP_ANNOUNCEMENT_CHANGE_PLAN_REVIEW_WORKFLOW.md)
- [Change Plans Review Workflow Closure](./CHANGE_PLANS_REVIEW_WORKFLOW_CLOSURE.md)
- [Snapshot Timelapse Diff](./BGP_ANNOUNCEMENT_SNAPSHOT_TIMELAPSE_DIFF.md)
- [Snapshot Timelapse Diff Closure](./BGP_ANNOUNCEMENT_SNAPSHOT_TIMELAPSE_DIFF_CLOSURE.md)
