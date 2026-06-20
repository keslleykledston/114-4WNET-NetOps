# BGP Announcement Matrix — Audit Events

Eventos registrados via `logAuditEvent` (`objectType: bgp_announcement_change_plan`).

## Matrix / refresh

| Evento | Quando | Payload mínimo | Criticidade | Onde consultar |
|--------|--------|----------------|-------------|----------------|
| `MATRIX_REFRESH_REQUESTED` | POST refresh iniciado | `device_id`, `summary` | info | audit log API/DB |
| `MATRIX_SNAPSHOT_CREATED` | Snapshot persistido com sucesso | `device_id`, `snapshot_id`, `summary` | info | audit log |
| `MATRIX_REFRESH_FAILED` | Refresh falhou | `device_id`, `error`, `summary` | warning | audit log |

## Preview / change-plan

| Evento | Quando | Payload mínimo | Criticidade | Onde consultar |
|--------|--------|----------------|-------------|----------------|
| `PREVIEW_CREATED` | Preview compilado (quando auditado) | `change_plan_id`, `device_id`, `risk_level` | info | audit log |
| `CHANGE_PLAN_DRAFT_CREATED` | Draft salvo | `change_plan_id`, `device_id`, `summary` | info | audit log |
| `CHANGE_PLAN_APPROVAL_REQUESTED` | Request approval | `change_plan_id`, `approval_id`, `risk_level` | info | audit log |
| `CHANGE_PLAN_APPROVED` | Approval aprovado | `change_plan_id`, `approval_id` | info | audit log |
| `CHANGE_PLAN_REJECTED` | Approval rejeitado | `change_plan_id`, `approval_id`, `reason` | info | audit log |
| `CHANGE_PLAN_CANCELLED` | Plan cancelado | `change_plan_id` | info | audit log |

## Dry-run / execution

| Evento | Quando | Payload mínimo | Criticidade | Onde consultar |
|--------|--------|----------------|-------------|----------------|
| `CHANGE_PLAN_DRY_RUN_STARTED` | Dry-run iniciado | `change_plan_id`, `approval_id`, `execution_id` | info | audit log + executions table |
| `CHANGE_PLAN_DRY_RUN_SUCCEEDED` | Dry-run OK | `change_plan_id`, `execution_id` | info | audit log + executions |
| `CHANGE_PLAN_DRY_RUN_FAILED` | Dry-run falhou | `change_plan_id`, `error` | warning | audit log |
| `CHANGE_PLAN_REAL_EXECUTION_BLOCKED` | Execute com flag OFF | `change_plan_id`, `featureFlag` | **high** | audit log + executions mode `real_blocked` |
| `REAL_EXECUTION_BLOCKED` | Guard bloqueou execução | `change_plan_id`, findings | **high** | audit log |
| `EXECUTION_LOCK_ACQUIRED` | Lock adquirido | `change_plan_id`, `device_id`, target refs | info | locks table + audit |
| `EXECUTION_LOCK_RELEASED` | Lock liberado | `change_plan_id`, lock status | info | locks table + audit |

## Postcheck

| Evento | Quando | Payload mínimo | Criticidade | Onde consultar |
|--------|--------|----------------|-------------|----------------|
| `POSTCHECK_STARTED` | Postcheck iniciado | `change_plan_id`, `execution_id` | info | postchecks table |
| `POSTCHECK_SUCCEEDED` | Expected = observed | `change_plan_id`, diff summary | info | postchecks + change-plan |
| `POSTCHECK_FAILED` | Mismatch | `change_plan_id`, findings | warning | postchecks |
| `POSTCHECK_INCONCLUSIVE` | Snapshot/target irresolvível | `change_plan_id`, reason | warning | postchecks |

## Rollback

| Evento | Quando | Payload mínimo | Criticidade | Onde consultar |
|--------|--------|----------------|-------------|----------------|
| `ROLLBACK_REQUESTED` | Rollback request criado | `change_plan_id`, `rollback_id` | info | rollbacks table |
| `ROLLBACK_APPROVED` | Rollback aprovado | `rollback_id`, `approved_by` | info | rollbacks |
| `ROLLBACK_REJECTED` | Rollback rejeitado | `rollback_id`, `reason` | info | rollbacks |
| `ROLLBACK_DRY_RUN_STARTED` | Rollback dry-run iniciado | `rollback_id`, `change_plan_id` | info | rollbacks log |
| `ROLLBACK_DRY_RUN_SUCCEEDED` | Rollback dry-run OK | `rollback_id` | info | rollbacks |
| `ROLLBACK_REAL_BLOCKED` | Rollback real flag OFF | `rollback_id`, `featureFlag` | **high** | rollbacks status `real_blocked` |
| `ROLLBACK_POSTCHECK_STARTED` | Postcheck rollback | `rollback_id` | info | rollbacks |
| `ROLLBACK_POSTCHECK_SUCCEEDED` | Rollback verificado | `rollback_id`, diff | info | rollbacks |
| `ROLLBACK_POSTCHECK_FAILED` | Rollback mismatch | `rollback_id`, findings | warning | rollbacks |

## History

| Evento | Quando | Payload mínimo | Criticidade | Onde consultar |
|--------|--------|----------------|-------------|----------------|
| `HISTORY_QUERIED` | GET history (quando auditado) | `device_id`, filters | low | audit log |

## Consulta

- Tabela audit global do NetOps (`logAuditEvent`).
- Entidades: `bgp_announcement_change_plans`, `_executions`, `_postchecks`, `_rollbacks`.
- UI: detalhe change-plan em `/bgp/announcements` → tab Change Plans.
