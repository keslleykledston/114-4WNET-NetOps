# BGP Announcement Change Plan Link

Vínculo seguro entre **Change Preview** (read-only) e **Change Plan** formal (draft), sem execução em device.

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

- `draft` — status persistido em `change_plans.status`
- `workflowStatus: draft` em metadata (extensível para `ready_for_review`, `rejected`, `archived`)

**Não criados:** `approved_for_execution`, `executing`, `executed`, `applied`, `rollback_executed`

## Endpoints

| Método | Path | RBAC |
|--------|------|------|
| POST | `/bgp/announcements/change-preview/:id/create-plan` | `bgp.announcements.plan` |
| GET | `/bgp/announcements/change-preview/:id/plan` | `bgp.announcements.read` |
| GET | `/bgp/announcements/change-plans?previewId=` | `bgp.announcements.read` |

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
```
