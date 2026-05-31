# FASE v0.7.0 — Provisioning Execute Controlado

## Overview

Execução de provisioning com controle total: aprovação obrigatória, plano de execução locked, pós-validação, e rollback planejado.

## Fluxo Completo

```
1. Generate
   POST /provisioning/preview
   → ProvisioningPreviewResult (config, validations, risks)

2. Validate
   POST /provisioning-jobs (status: draft)
   → job_id

3. Request Approval
   POST /provisioning-jobs/:id/request-approval
   → status: pending_approval

4. Approve (RBAC admin/operator)
   POST /provisioning-jobs/:id/approve [requireRole admin/operator]
   → approvedByUserId + approvedAt + executionPlanJson saved
   → status: approved

5. Execute (RBAC admin/operator, feature flag, maintenance window)
   POST /provisioning-jobs/:id/execute [requireRole admin/operator]
   → Validações:
      • PROVISIONING_EXECUTE_ENABLED=true (else 503)
      • approvedByUserId != null (else 409)
      • maintenanceWindowStart/End check (else 409)
   → Gera rollback_plan_generated
   → Executa via connector (PROVISION_EXECUTE job type)
   → status: executing → completed

6. Post-Check (RBAC admin/operator)
   POST /provisioning-jobs/:id/postcheck [requireRole admin/operator]
   → Via connector (PROVISION_POSTCHECK job type)
   → Valida resultado no device
   → status: completed → postcheck_running → postcheck_completed

7. Rollback Preview
   GET /provisioning-jobs/:id/rollback-preview [requireRole admin/operator]
   → Retorna rollback_plan_generated

8. Rollback (RBAC admin/operator)
   POST /provisioning-jobs/:id/rollback [requireRole admin/operator]
   → Exige rollback_plan_generated != null
   → status: completed → rolled_back
```

## Estado da Máquina

```
draft → validated → pending_approval → approved → executing → completed
                                                              ↓
                                                    postcheck_running
                                                              ↓
                                                    postcheck_completed
                                                              ↓
                                                          rolled_back

blocked → [cancel]
cancelled → [end]
failed → draft (retry)
```

## Feature Flag

**`PROVISIONING_EXECUTE_ENABLED`** (padrão: `false`)

- `false`: Execute retorna 503 "PROVISIONING_EXECUTE_ENABLED=false"
- `true`: Execute permitido (com validações adicionais)

```bash
# Bloquear execução (padrão)
PROVISIONING_EXECUTE_ENABLED=false

# Permitir execução
PROVISIONING_EXECUTE_ENABLED=true
```

## Campos Novos no Job

| Campo | Tipo | Quando | Conteúdo |
|-------|------|--------|----------|
| `approved_by_user_id` | integer | Na aprovação | ID do usuário que aprovou |
| `approved_at` | timestamp | Na aprovação | Hora da aprovação |
| `execution_plan_json` | text | Na aprovação | Comandos locked `{"commands": [...]}` |
| `rollback_plan_generated` | text | Antes de executar | Snapshot do plano de rollback |
| `postcheck_at` | timestamp | Após postcheck | Hora do postcheck |
| `postcheck_result` | text | Após postcheck | "passed" \| "failed" \| "partial" |
| `postcheck_output` | text | Após postcheck | Output do postcheck |
| `maintenance_window_start` | timestamp | Na criação (opcional) | Início da janela |
| `maintenance_window_end` | timestamp | Na criação (opcional) | Fim da janela |

## Job Types de Connector

| Tipo | Timeout | Propósito |
|------|---------|----------|
| `PROVISION_PREVIEW` | 240s | Preview (dry-run) |
| `PROVISION_VALIDATE` | 120s | Validar antes de aprovar |
| `PROVISION_EXECUTE` | 300s | Executar no device |
| `PROVISION_POSTCHECK` | 120s | Validar após execução |
| `PROVISION_ROLLBACK` | 300s | Executar rollback |
| `PROVISION_ROLLBACK_PREVIEW` | 120s | Preview do rollback |

## Segurança

### Approval Obrigatório
- Execute rejeita jobs sem `approvedByUserId` (409)
- Aprovação registra quem aprovou + quando

### Execution Plan Locked
- Plano gerado no momento da aprovação
- Execute verifica que comandos são do plano aprovado
- Bloqueia comandos fora do plano

### Feature Flag
- Default: false (bloqueado)
- Requires explicit `PROVISIONING_EXECUTE_ENABLED=true`
- Retorna 503 se desabilitado

### Maintenance Window
- Opcional na criação
- Se definido, execute valida que horário atual está dentro
- Evita execução fora de janelas planejadas

### Output Masking
- Stdout/stderr mascarados: `password=[REDACTED]`, `community=[REDACTED]`
- Logs nunca expõem secrets

### RBAC
- `/approve`, `/execute`, `/postcheck`, `/rollback`: `requireRole(["admin", "operator"])`
- Usuários comuns (viewer) não podem ejecutar

## Audit Trail

| Ação | Objeto | Metadados |
|------|--------|-----------|
| `provisioning_approve` | job | jobName, jobType, approvedBy, executeEnabled |
| `provisioning_execute` | job | jobName, jobType, executedBy |
| `provisioning_execute_blocked` | job | reason (flag disabled) |
| `provisioning_execute_failed` | job | reason (error message) |
| `provisioning_postcheck` | job | passed, status, outputLength |
| `provisioning_postcheck_failed` | job | reason |
| `provisioning_rollback_preview` | job | jobName, hasPlan |
| `provisioning_rollback` | job | jobName, jobType, blocked |

## APIs

### Approve Job
```
POST /provisioning-jobs/:id/approve

Headers:
  Authorization: Bearer <admin-or-operator-token>

Response:
{
  "id": 1,
  "status": "approved",
  "approvedByUserId": 42,
  "approvedAt": "2026-05-31T14:30:00Z",
  "executionPlanJson": "{\"commands\": [...]}"
}
```

### Execute Job
```
POST /provisioning-jobs/:id/execute

Headers:
  Authorization: Bearer <admin-or-operator-token>

Validações:
  • PROVISIONING_EXECUTE_ENABLED=true (else 503)
  • approvedByUserId != null (else 409)
  • maintenanceWindow check (else 409)

Response:
{
  "id": 1,
  "status": "executing",
  "executedAt": "2026-05-31T14:31:00Z"
}
```

### Run Post-Check
```
POST /provisioning-jobs/:id/postcheck

Headers:
  Authorization: Bearer <admin-or-operator-token>

Response:
{
  "jobId": 1,
  "passed": true,
  "status": "passed",
  "output": "...",
  "timestamp": "2026-05-31T14:32:00Z"
}
```

### Get Rollback Preview
```
GET /provisioning-jobs/:id/rollback-preview

Headers:
  Authorization: Bearer <admin-or-operator-token>

Response:
{
  "jobId": 1,
  "rollbackPlan": "# Rollback...",
  "generated": true
}
```

### Rollback
```
POST /provisioning-jobs/:id/rollback

Headers:
  Authorization: Bearer <admin-or-operator-token>

Validações:
  • rollback_plan_generated != null (else 409)

Response:
{
  "id": 1,
  "status": "rolled_back",
  "completedAt": "2026-05-31T14:33:00Z"
}
```

## Ejemplo: Flujo Completo

```bash
# 1. Preview
curl -X POST http://localhost:8085/api/provisioning/preview \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": 1,
    "templateId": "bgp_customer",
    "parameters": {
      "peerIp": "10.10.1.1",
      "peerAs": "65001"
    }
  }'

# 2. Crear job
curl -X POST http://localhost:8085/api/provisioning-jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Add BGP peer",
    "type": "bgp_customer",
    "deviceIds": "[1]",
    "templateId": 1,
    "parameters": "{...}"
  }'
# → jobId = 42

# 3. Request approval
curl -X POST http://localhost:8085/api/provisioning-jobs/42/request-approval \
  -H "Authorization: Bearer $TOKEN"
# → status: pending_approval

# 4. Approve (admin)
curl -X POST http://localhost:8085/api/provisioning-jobs/42/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# → status: approved, approvedByUserId: 1, approvedAt: now

# 5. Execute (admin)
curl -X POST http://localhost:8085/api/provisioning-jobs/42/execute \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# → status: executing

# (polling...)
# → status: completed

# 6. Post-check (admin)
curl -X POST http://localhost:8085/api/provisioning-jobs/42/postcheck \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# → status: postcheck_running → postcheck_completed

# 7. Rollback preview
curl -X GET http://localhost:8085/api/provisioning-jobs/42/rollback-preview \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# → rollback_plan

# 8. Rollback (admin)
curl -X POST http://localhost:8085/api/provisioning-jobs/42/rollback \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# → status: rolled_back
```

## Troubleshooting

### "PROVISIONING_EXECUTE_ENABLED=false"
- Execute bloqueado por design
- Ativar flag: `PROVISIONING_EXECUTE_ENABLED=true`
- Verifica ambiente/config

### "Job must be approved before execute"
- Job não foi aprovado
- Execute `/approve` endpoint com admin role

### "Execution outside maintenance window"
- Horário atual fora da janela
- Aguarde ou reschedule

### "Rollback plan never generated"
- Rollback exige que `/execute` tenha sido rodado antes
- Execute o job first

## Referências

- Provisioning Execute Service: `provisioning-execute.service.ts`
- Provisioning Postcheck Service: `provisioning-postcheck.service.ts`
- Connector Execution: `connector-execution.service.ts`
