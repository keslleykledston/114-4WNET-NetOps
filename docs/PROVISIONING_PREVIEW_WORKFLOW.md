# Provisioning Preview & Approval Workflow (v0.4.0)

## Objetivo

Configuração **assistida** com preview/export e aprovação humana — **sem apply real por padrão**.

## Feature flags

| Variável | Default | Efeito |
|----------|---------|--------|
| `CONFIG_APPLY_ENABLED` | `false` | Bloqueia execute/rollback real |
| `DRY_RUN_DEFAULT` | `true` | Execute em modo seguro quando apply habilitado |

## Estados do job

```text
draft → validated → pending_approval → approved → (execute → blocked|executing)
         ↓              ↓                ↓
      cancelled      cancelled        cancelled
```

- **blocked**: execute tentado com `CONFIG_APPLY_ENABLED=false`
- **cancelled**: operador cancelou

## Service templates (built-in)

| serviceType | Descrição |
|-------------|-----------|
| `l2vpn_vpws` | L2VPN VPWS / L2VC |
| `l2vpn_vpls` | L2VPN VPLS / VSI |
| `l3vpn_vrf` | L3VPN / VRF |
| `bgp_peer_customer` | BGP eBGP cliente |
| `bgp_peer_provider` | BGP eBGP operadora/upstream |

Templates são seed em `config_templates` no startup da API (`ensureServiceTemplatesInDb`).

## Endpoints

```text
GET  /api/provisioning/service-templates
POST /api/provisioning/preview
POST /api/provisioning-jobs
POST /api/provisioning-jobs/:id/validate
POST /api/provisioning-jobs/:id/preview      # Markdown export
POST /api/provisioning-jobs/:id/request-approval
POST /api/provisioning-jobs/:id/approve
POST /api/provisioning-jobs/:id/cancel
POST /api/provisioning-jobs/:id/execute      # blocked por padrão
POST /api/provisioning-jobs/:id/report
```

### POST /api/provisioning/preview

Body:

```json
{
  "deviceId": 1,
  "serviceType": "l3vpn_vrf",
  "parameters": { "vrfName": "CUST-A", "rd": "65000:100", "interfaceName": "GE0/0/1", "peCeAddress": "10.0.0.1/30" },
  "maintenanceWindowStart": "2026-05-21T02:00:00Z",
  "maintenanceWindowEnd": "2026-05-21T04:00:00Z",
  "rollbackPlan": "Remover binding VRF na interface..."
}
```

Resposta: `configPreview`, `rollbackPreview`, `validations`, `risks`, `missingData`, `applyBlocked`.

## UI — `/provisioning`

Fluxo:

1. Escolher device e serviço
2. Preencher parâmetros + janela de manutenção + rollback textual
3. **Preview** (stateless)
4. **Salvar rascunho** → job `draft`
5. **Validar** → `validated`
6. **Solicitar aprovação** → `pending_approval`
7. **Aprovar** → `approved` (apply ainda bloqueado)
8. **Exportar plano** → Markdown + report DB
9. **Testar execute** → audit `provisioning_execute_blocked`

## Audit obrigatório

Ações auditadas (metadata sanitizada):

- `provisioning_preview`
- `provisioning_validate`
- `provisioning_request_approval`
- `provisioning_approve`
- `provisioning_cancel`
- `provisioning_execute_blocked`
- `provisioning_report`

## Segurança

- Preview lines prefixadas `# PREVIEW ONLY`
- Nenhum `system-view`, `commit`, `save` no gerador v0.4.0
- `snmpCommunity` / password nunca no JSON de devices
- Communities não logadas em audit metadata

## Fase futura — apply controlado

Pré-requisitos sugeridos:

1. `CONFIG_APPLY_ENABLED=true` apenas em ambiente controlado
2. Job `approved` + janela de manutenção ativa
3. RBAC role `provisioner` + segundo aprovador
4. SSH allowlist Huawei VRP para comandos de apply
5. Snapshot before/after + rollback automático opcional
