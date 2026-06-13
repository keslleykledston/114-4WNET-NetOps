# BGP Announcement Change Plan Review Workflow

Workflow **documental** de revisão humana para Change Plans originados da BGP Announcement Matrix. Nenhum comando é executado, nenhuma configuração é aplicada e **Controlled Execution não é invocado**.

## Draft vs revisão vs aprovação manual

| Estágio | `workflowStatus` | Significado |
|---------|------------------|-------------|
| Draft | `draft` | Plano criado a partir do Change Preview; ainda não enviado para revisão |
| Revisão | `ready_for_review` | Operador submeteu; aguarda decisão de revisor/admin |
| Ajustes | `needs_changes` | Revisor pediu correções; operador pode reenviar |
| Rejeitado | `rejected` | Plano recusado (nota obrigatória) |
| Aprovação manual | `approved_for_manual_implementation` | Aprovado **somente** para implementação humana fora do sistema |
| Arquivado | `archived` | Encerrado sem execução automática |

**Importante:** `approved_for_manual_implementation` **não executa** nada no NetOps. É um carimbo documental para NOC/engineering implementar manualmente.

## Status proibidos nesta fase

Transições para estes status são bloqueadas:

- `approved_for_execution`
- `executing`
- `executed`
- `applied`
- `failed`
- `rollback_executed`

## Transições permitidas

```
draft → ready_for_review | archived
ready_for_review → needs_changes | rejected | approved_for_manual_implementation
needs_changes → ready_for_review
rejected → archived
approved_for_manual_implementation → archived
```

## Permissões (RBAC)

| Ação | Permissão | Roles típicos |
|------|-----------|---------------|
| Ler planos | `bgp.announcements.read` | viewer, operator, admin |
| Enviar para revisão / reenviar após ajustes / arquivar draft | `bgp.announcements.plan` | operator, admin |
| Solicitar ajustes / rejeitar / aprovar manual / arquivar pós-decisão | `bgp.announcements.approve` | admin (revisor) |

Ninguém possui botão ou endpoint de execução nesta fase.

## Endpoints

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/change-plans` | Lista (`module`, `workflowStatus`, `deviceId`) |
| GET | `/change-plans/:id` | Detalhe + histórico de revisão |
| POST | `/change-plans/:id/submit-review` | `draft` ou `needs_changes` → `ready_for_review` |
| POST | `/change-plans/:id/request-changes` | → `needs_changes` (nota obrigatória) |
| POST | `/change-plans/:id/reject` | → `rejected` (nota obrigatória) |
| POST | `/change-plans/:id/approve-manual` | → `approved_for_manual_implementation` |
| POST | `/change-plans/:id/archive` | → `archived` |

Body opcional para ações com nota:

```json
{ "note": "Motivo da rejeição ou ajustes solicitados" }
```

## Audit e histórico

Eventos registrados em `change_plan_review_events` e audit trail:

- `change_plan_submitted_for_review`
- `change_plan_needs_changes`
- `change_plan_rejected`
- `change_plan_approved_for_manual_implementation`
- `change_plan_archived`

Cada evento inclui: `changePlanId`, `module`, `sourceObjectType`, `sourceObjectId`, `actor`, `previousStatus`, `nextStatus`, `note`, `timestamp`.

Sem secrets, credenciais ou comandos de device.

## Preservação de conteúdo

`ticketMarkdown` e `logicalDiff` permanecem em `change_plans.metadata_json` após cada transição. O vínculo com o Change Preview (`sourceObjectType=bgp_announcement_change_preview`, `sourceObjectId`) é mantido.

## UI

- Rota `/change-plans` — lista com filtros por módulo/status; destaque para `bgp_announcements`
- Modal/detalhe — ticket, diff lógico, risco, histórico, ações de revisão (sem Executar/Aplicar)
- BGP Change Preview — link **Ver plano** abre o detalhe; aviso quando `approved_for_manual_implementation`

## Relação futura com Controlled Execution

Esta fase **não** integra Controlled Execution. Uma fase futura poderá:

1. Exigir `approved_for_manual_implementation` ou um novo status explícito de execução
2. Adicionar gates separados (`CONFIG_APPLY_ENABLED`, RBAC de execução)
3. Manter audit distincto entre revisão documental e apply real

Até lá, qualquer implementação é **100% manual** fora do NetOps.

## Limites de segurança

- Sem SSH, SNMP, connector ou discovery real neste workflow
- Sem botões apply/execute na UI
- Sem alteração no Config Generator ou Copilot
- Migration `0051_change_plan_review_events.sql` — histórico de revisão

## Validação

```bash
cd workspace && pnpm run typecheck
node tools/change-plans-review-workflow-selftest.mjs
node tools/change-plans-selftest.mjs
node tools/bgp-announcement-change-plan-link-selftest.mjs
```

## Documentos relacionados

- [`BGP_ANNOUNCEMENT_CHANGE_PLAN_LINK.md`](./BGP_ANNOUNCEMENT_CHANGE_PLAN_LINK.md)
- [`BGP_ANNOUNCEMENT_MVP_READONLY_CLOSURE.md`](./BGP_ANNOUNCEMENT_MVP_READONLY_CLOSURE.md)
- [`BGP_ANNOUNCEMENT_MATRIX_INTEGRATION_MAP.md`](./BGP_ANNOUNCEMENT_MATRIX_INTEGRATION_MAP.md)
