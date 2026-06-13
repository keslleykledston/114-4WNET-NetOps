# Change Plans Review Workflow — Closure

**Data:** 2026-06-13  
**Branch:** `codex/bgp-peer-dedupe`  
**Commit de implementação:** `c6df3be` — `feat(change-plans): add manual review workflow for BGP announcement plans`  
**Status:** ✅ Workflow documental de revisão fechado — validado em runtime (Change Plan #28)

Documento oficial de encerramento da fase **CHANGE-PLANS.REVIEW-WORKFLOW** para planos originados da BGP Announcement Matrix. Nenhuma execução em device, apply automático ou Controlled Execution faz parte desta fase.

---

## 1. Resumo executivo

O NetOps passa a oferecer um fluxo **observar → simular → solicitar mudança (draft) → revisar → aprovar para implementação manual**, totalmente documental:

- **Change Preview** gera diff lógico + ticket Markdown (read-only).
- **Draft Change Plan** formaliza o preview em `change_plans`.
- **Review Workflow** adiciona estados humanos (`ready_for_review`, `needs_changes`, `approved_for_manual_implementation`, etc.) com histórico auditável.
- **UI `/change-plans`** lista, filtra e permite ações de revisão conforme RBAC — **sem botão Executar/Aplicar**.

Runtime smoke concluído no **Change Plan #28** (device 94, preview #8). Migration **0051** aplicada. API/Web healthy. Typecheck OK.

---

## 2. Escopo entregue

| Item | Entrega | Status |
|------|---------|--------|
| Migration 0051 | Tabela `change_plan_review_events` | ✅ |
| Backend | `change-plan-review.service.ts`, rotas `/change-plans/*` | ✅ |
| RBAC | `bgp.announcements.read` / `.plan` / `.approve` | ✅ |
| UI | Página `/change-plans` + modal de detalhe/revisão | ✅ |
| Audit | Eventos em `audit_logs` + histórico em DB | ✅ |
| Preservação | `ticketMarkdown`, `logicalDiff` após transições | ✅ |
| Selftests | `change-plans-review-workflow-selftest.mjs` | ✅ |
| Runtime smoke | Transições completas no plan #28 | ✅ |
| Docs | Workflow + closure | ✅ |

**Fora de escopo:** apply, execute, Controlled Execution, SSH/SNMP/connector no fluxo de revisão, Config Generator, Copilot.

---

## 3. Relação com BGP Announcement Matrix

```
BGP Announcement Matrix (read-only)
        │
        ▼
Change Preview (persistido)
        │
        ▼
Draft Change Plan (change_plans, module=bgp_announcements)
        │
        ▼
Review Workflow (metadata.workflowStatus + change_plan_review_events)
        │
        ▼
approved_for_manual_implementation  ←  implementação humana FORA do NetOps
```

Documentos relacionados:

- [`BGP_ANNOUNCEMENT_MVP_READONLY_CLOSURE.md`](./BGP_ANNOUNCEMENT_MVP_READONLY_CLOSURE.md) — MVP matriz read-only
- [`BGP_ANNOUNCEMENT_CHANGE_PLAN_LINK.md`](./BGP_ANNOUNCEMENT_CHANGE_PLAN_LINK.md) — Preview → draft
- [`BGP_ANNOUNCEMENT_CHANGE_PLAN_REVIEW_WORKFLOW.md`](./BGP_ANNOUNCEMENT_CHANGE_PLAN_REVIEW_WORKFLOW.md) — Referência operacional do workflow

---

## 4. Estados permitidos

| `workflowStatus` | Significado |
|------------------|-------------|
| `draft` | Plano criado; ainda não enviado para revisão |
| `ready_for_review` | Submetido por operador; aguarda revisor |
| `needs_changes` | Revisor solicitou ajustes (nota obrigatória) |
| `rejected` | Plano rejeitado (nota obrigatória) |
| `approved_for_manual_implementation` | Aprovado **somente** para implementação humana externa |
| `archived` | Encerrado sem execução automática |

Fonte de verdade: `change_plans.metadata_json.workflowStatus`. Coluna `change_plans.status` permanece `draft` (exceto `archived` → `closed`).

---

## 5. Estados proibidos nesta fase

Transições bloqueadas:

- `approved_for_execution`
- `executing`
- `executed`
- `applied`
- `failed`
- `rollback_executed`

Endpoints inexistentes retornam **404** (`/execute`, `/apply`, `/approve-execution`, `/rollback-executed`).

---

## 6. Transições permitidas

```
draft → ready_for_review | archived
ready_for_review → needs_changes | rejected | approved_for_manual_implementation
needs_changes → ready_for_review
rejected → archived
approved_for_manual_implementation → archived
```

Nota obrigatória em `reject` e `request-changes`.

---

## 7. RBAC

| Role | Permissões | Ações |
|------|------------|-------|
| **viewer** | `bgp.announcements.read` | Ler planos e histórico |
| **operator** | `.read` + `.plan` | `submit-review` (draft/needs_changes), arquivar draft |
| **admin / reviewer** | `.read` + `.plan` + `.approve` | `request-changes`, `reject`, `approve-manual`, arquivar pós-decisão |

Nenhum role possui permissão de execução nesta fase.

---

## 8. Endpoints

| Método | Path | RBAC |
|--------|------|------|
| GET | `/api/change-plans` | `read` |
| GET | `/api/change-plans/:id` | `read` |
| POST | `/api/change-plans/:id/submit-review` | `plan` |
| POST | `/api/change-plans/:id/request-changes` | `approve` |
| POST | `/api/change-plans/:id/reject` | `approve` |
| POST | `/api/change-plans/:id/approve-manual` | `approve` |
| POST | `/api/change-plans/:id/archive` | `plan` / `approve` (por status) |

Criação de draft (via preview): `POST /api/bgp/announcements/change-preview/:id/create-plan` — ver [Change Plan Link](./BGP_ANNOUNCEMENT_CHANGE_PLAN_LINK.md).

---

## 9. UI `/change-plans`

Rota: `http://localhost:3005/change-plans` (lab)

- Lista com filtro por módulo (`bgp_announcements`) e `workflowStatus`
- Destaque visual para planos BGP
- Modal de detalhe: ticket Markdown, diff lógico, diff estrutural, rollback documental, histórico de revisão
- Botões conforme role: Enviar para revisão, Solicitar ajustes, Rejeitar, Aprovar para implementação manual, Arquivar
- **Ausentes:** Executar, Aplicar, Aprovar execução, Enviar para device
- Aviso quando `approved_for_manual_implementation`: *"Nenhum comando será executado pelo sistema."*
- Link **Ver plano** no Change Preview aponta para `/change-plans?highlight={id}`

---

## 10. Histórico e audit log

### Tabela `change_plan_review_events` (migration 0051)

Campos: `change_plan_id`, `actor`, `previous_status`, `next_status`, `note`, `metadata_json`, `created_at`.

### Audit trail (`audit_logs`)

| Ação | Quando |
|------|--------|
| `change_plan_submitted_for_review` | draft/needs_changes → ready_for_review |
| `change_plan_needs_changes` | ready_for_review → needs_changes |
| `change_plan_rejected` | ready_for_review → rejected |
| `change_plan_approved_for_manual_implementation` | ready_for_review → approved |
| `change_plan_archived` | → archived |

Metadata inclui: `changePlanId`, `module`, `sourceObjectType`, `sourceObjectId`, `previousStatus`, `nextStatus`, `note`, `timestamp`. Sem secrets ou comandos de device.

---

## 11. Smoke test runtime — Change Plan #28

**Ambiente:** API `:8085`, Web `:3005`, Postgres `:5435`  
**Plano:** `#28` — `module=bgp_announcements`, device 94, preview `#8`, target `AS264196-RORAIMANET-Import-IPv4`

### Estado inicial

- `workflowStatus`: `draft`
- `ticketMarkdown` e `logicalDiff`: presentes
- `reviewHistory`: 0 eventos

### Transições executadas

| # | Ação | Resultado | HTTP |
|---|------|-----------|------|
| 1 | `submit-review` | `ready_for_review` | 200 |
| 2 | `request-changes` (nota) | `needs_changes` | 200 |
| 3 | `submit-review` | `ready_for_review` | 200 |
| 4 | `approve-manual` (nota) | `approved_for_manual_implementation` | 200 |

### Bloqueios validados

| Tentativa | HTTP | Status preservado |
|-----------|------|-------------------|
| `POST .../execute` | 404 | ✅ |
| `POST .../apply` | 404 | ✅ |
| `POST .../approve-execution` | 404 | ✅ |
| `POST .../submit-review` (já aprovado) | 403 | ✅ |

### Evidências DB

4 registros em `change_plan_review_events` (ids 1–4). Eventos correspondentes em `audit_logs`. `ticketMarkdown` e `logicalDiff` intactos após todas as transições.

### UI

Modal exibiu histórico completo, alerta de implementação manual, botão **Arquivar** apenas — sem Executar/Aplicar.

---

## 12. Garantias de segurança

| Garantia | Status |
|----------|--------|
| Sem SSH no workflow | ✅ |
| Sem SNMP no workflow | ✅ |
| Sem connector no workflow | ✅ |
| Sem apply de configuração | ✅ |
| Sem Controlled Execution | ✅ |
| Status de execução bloqueados | ✅ |
| Endpoints execute/apply inexistentes | ✅ |

Logs da API durante o smoke mostraram apenas GET/POST em `/api/change-plans/*`. SNMP poll e connector heartbeat em background são independentes deste fluxo.

---

## 13. Limitações conhecidas

- Workflow aplicável apenas a `module=bgp_announcements` (planos BGP cleanup usam fluxo legado).
- `approved_for_manual_implementation` não gera ticket externo (Jira/ServiceNow) — apenas documentação interna.
- Rejeição (`rejected`) e arquivamento pós-rejeição não foram exercidos no smoke #28 (caminho implementado e coberto por selftest).
- RBAC usa defaults por role; `permissionsJson` customizado não exposto na sessão pública.
- Não há notificação push/e-mail ao revisor quando plano entra em `ready_for_review`.
- Filtro UI por status depende de `workflowStatus` em metadata, não da coluna legada `change_plans.status`.

---

## 14. Próximas fases recomendadas

1. **Notificações de revisão** — alertar revisor quando plano entra em `ready_for_review`.
2. **Export operacional** — PDF/markdown assinado para ticket externo pós `approved_for_manual_implementation`.
3. **Controlled Execution (fase separada)** — gate explícito, flag `CONFIG_APPLY_ENABLED`, RBAC de execução, audit distincto — **não reutilizar** `approved_for_manual_implementation` como trigger automático.
4. **Extensão a outros módulos** — BGP peer cleanup com mesmo padrão documental, se desejado.
5. **Dashboard NOC** — contagem de planos pendentes de revisão por device/risco.

---

## 15. Checklist operacional

Antes de considerar um plano "pronto para implementação manual":

- [ ] Plano originado de preview BGP com target `editable_future`
- [ ] `workflowStatus` = `approved_for_manual_implementation`
- [ ] Ticket Markdown revisado por humano
- [ ] Diff lógico e riscos compreendidos
- [ ] Histórico de revisão com notas quando aplicável
- [ ] Implementação feita **manualmente** fora do NetOps
- [ ] Nenhuma expectativa de apply automático pelo sistema

---

## 16. Smoke test manual repetível

### Pré-requisitos

```bash
docker compose ps   # api/web/db healthy
# migration 0051 aplicada
DATABASE_URL="postgresql://netops:netops@localhost:5435/netops" \
  pnpm --filter @workspace/db run migrate:safe
```

### API (substituir `PLAN_ID` e credenciais)

```bash
API=http://127.0.0.1:8085
# login → cookie netops_session

curl -b cookies.txt "$API/api/change-plans/PLAN_ID"
curl -b cookies.txt -X POST "$API/api/change-plans/PLAN_ID/submit-review" -H 'Content-Type: application/json' -d '{}'
curl -b cookies.txt -X POST "$API/api/change-plans/PLAN_ID/request-changes" \
  -H 'Content-Type: application/json' -d '{"note":"Revisar community alvo."}'
curl -b cookies.txt -X POST "$API/api/change-plans/PLAN_ID/submit-review" -H 'Content-Type: application/json' -d '{}'
curl -b cookies.txt -X POST "$API/api/change-plans/PLAN_ID/approve-manual" \
  -H 'Content-Type: application/json' -d '{"note":"Aprovado apenas para implementação manual."}'

# bloqueio esperado:
curl -b cookies.txt -X POST "$API/api/change-plans/PLAN_ID/execute"   # → 404
```

### UI

1. Abrir `http://localhost:3005/change-plans`
2. Filtrar BGP Announcements
3. Abrir detalhe do plano
4. Confirmar histórico, aviso manual, ausência de Executar/Aplicar

### Selftests

```bash
node tools/change-plans-review-workflow-selftest.mjs
node tools/change-plans-selftest.mjs
node tools/bgp-announcement-change-plan-link-selftest.mjs
cd workspace && pnpm run typecheck
```

---

## Referências

| Recurso | Caminho |
|---------|---------|
| Review service | `workspace/artifacts/api-server/src/modules/change-plans/change-plan-review.service.ts` |
| Rotas | `workspace/artifacts/api-server/src/modules/change-plans/change-plans.routes.ts` |
| UI | `workspace/artifacts/netops-manager/src/pages/change-plans.tsx` |
| Migration | `workspace/lib/db/migrations/0051_change_plan_review_events.sql` |
| Selftest | `tools/change-plans-review-workflow-selftest.mjs` |
