# BGP Announcement Change Plan Link

Vínculo seguro entre **Change Preview** (read-only) e **Change Plan** formal (draft), sem execução em device.

> **MVP read-only fechado:** ver [`BGP_ANNOUNCEMENT_MVP_READONLY_CLOSURE.md`](./BGP_ANNOUNCEMENT_MVP_READONLY_CLOSURE.md)

## Preview vs Change Plan

| Aspecto | Change Preview | Change Plan (draft) |
|---------|----------------|---------------------|
| Propósito | Simular alteração lógica | Solicitação estruturada de mudança |
| Execução | Nunca | Nunca nesta fase |
| Aprovação | N/A | Não — `draft` ≠ aprovado |
| Persistência | `bgp_announcement_change_previews` | `change_plans` (+ snapshots/diffs) |
| Ticket | Markdown operacional | Preservado em `metadata.ticketMarkdown` |

## Quem pode criar

| Role | Criar draft | Ler |
|------|-------------|-----|
| viewer | Não | Sim |
| operator/admin | Sim (`bgp.announcements.plan`) | Sim |

## Status permitidos (esta fase)

Workflow documental em `metadata.workflowStatus`:

- `draft` — criado a partir do preview
- `ready_for_review` — submetido por operador
- `needs_changes` — revisor solicitou ajustes (nota obrigatória)
- `rejected` — rejeitado (nota obrigatória)
- `approved_for_manual_implementation` — aprovado **somente** para implementação humana (não executa)
- `archived` — encerrado sem execução

Ver workflow completo: [`BGP_ANNOUNCEMENT_CHANGE_PLAN_REVIEW_WORKFLOW.md`](./BGP_ANNOUNCEMENT_CHANGE_PLAN_REVIEW_WORKFLOW.md)

**Não criados / bloqueados:** `approved_for_execution`, `executing`, `executed`, `applied`, `rollback_executed`

## Endpoints (criação + revisão)

| Método | Path | RBAC |
|--------|------|------|
| POST | `/bgp/announcements/change-preview/:id/create-plan` | `bgp.announcements.plan` |
| GET | `/bgp/announcements/change-preview/:id/plan` | `bgp.announcements.read` |
| GET | `/bgp/announcements/change-plans?previewId=` | `bgp.announcements.read` |
| GET | `/change-plans` | `bgp.announcements.read` |
| GET | `/change-plans/:id` | `bgp.announcements.read` |
| POST | `/change-plans/:id/submit-review` | `bgp.announcements.plan` |
| POST | `/change-plans/:id/request-changes` | `bgp.announcements.approve` |
| POST | `/change-plans/:id/reject` | `bgp.announcements.approve` |
| POST | `/change-plans/:id/approve-manual` | `bgp.announcements.approve` |
| POST | `/change-plans/:id/archive` | `bgp.announcements.plan` / `.approve` (por status) |

Body opcional para POST:
```json
{ "acknowledgeHighRisk": true }
```

Obrigatório quando `riskAssessment.level === "high"`.

## Validações

Bloqueia criação se:
- preview blocked / unsupported
- target não `editable_future`
- upstream/provider/IX/CDN/unknown/ibgp
- global protegido como alvo
- plano já existe para o preview

Permite com warning:
- risk high (com ack)
- dados incompletos
- `shared_requires_review`

## Audit

Evento: `announcement_change_plan_draft_created`

Metadata: `sourcePreviewId`, `changePlanId`, `deviceId`, `targetId`, `riskLevel`, `createdBy`

## Migration

`0050_bgp_preview_change_plan_link.sql` — coluna `change_plan_id` em `bgp_announcement_change_previews`.

## Relação futura

- **Controlled Execution:** não invocado; plano draft pode ser promovido manualmente em fase futura.
- **Rollback:** documental via `change_plan_diffs.rollback_json` — sem apply automático.
- **Globais protegidos:** listados como `globalPreserved`, `willBeRemoved: false`.

## Validação

```bash
node tools/bgp-announcement-change-plan-link-selftest.mjs
node tools/bgp-announcement-change-preview-selftest.mjs
node tools/change-plans-review-workflow-selftest.mjs
```
```
