# v0.4.0 — Provisioning Preview Engine Validation

**Data:** 2026-05-28  
**Branch:** `feature/v0.3.4-operational-pilot-noc`  
**Escopo:** Preview engine seguro (sem apply real)

## Entregas

| Item | Status |
|------|--------|
| Módulo `modules/provisioning/` | OK |
| 9 templates Huawei VRP | OK |
| GET `/api/provisioning/templates` | OK |
| GET `/api/provisioning/templates/:id` | OK |
| POST `/api/provisioning/preview` | OK |
| POST `/api/provisioning/preview/export` | OK |
| Permissão `provisioning.read` | OK |
| Validação discovery (warnings) | OK |
| Audit `provisioning_preview_created` | OK |
| Selftest `tools/provisioning-preview-selftest.mjs` | Ver execução abaixo |

## Templates

| ID | serviceType |
|----|-------------|
| `huawei-vrp-bgp-customer` | bgp_customer |
| `huawei-vrp-bgp-provider` | bgp_provider |
| `huawei-vrp-l3vpn-vrf` | l3vpn_vrf |
| `huawei-vrp-l2vpn-vpws` | l2vpn_vpws |
| `huawei-vrp-l2vpn-vpls` | l2vpn_vpls |
| `huawei-vrp-subinterface-dot1q` | interface_subinterface |
| `huawei-vrp-route-policy` | route_policy |
| `huawei-vrp-community-filter` | community_filter |
| `huawei-vrp-prefix-list` | prefix_list |

## Guardrails confirmados

- `CONFIG_APPLY_ENABLED=false` → `applyBlocked: true` no preview
- Execute/rollback de jobs legados permanecem bloqueados
- Sem SSH write no preview engine
- Secrets mascarados em preview/export/audit

## Comandos de validação

```bash
cd workspace && pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/netops-manager typecheck
BASE_PATH=/ PORT=5000 pnpm run build
pnpm --filter @workspace/api-spec run codegen
node tools/provisioning-preview-selftest.mjs
```

## Riscos conhecidos

- Templates Huawei são skeleton operacional — revisão NOC antes de qualquer apply futuro
- Validação discovery depende de snapshot persistido (ausência → warnings only)
- Jobs legados (`/provisioning-jobs`) coexistem com novo engine; apply path legado permanece desabilitado por flag

## Próximo passo

v0.4.1 — UI wizard + `/templates` view/edit + RBAC por botão
