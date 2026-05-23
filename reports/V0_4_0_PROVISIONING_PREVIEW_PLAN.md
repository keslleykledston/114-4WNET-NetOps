# v0.4.0 — Provisioning Preview & Approval Plan

**Data:** 2026-05-21  
**Status:** Implementado (preview + approval sem apply real)

## Escopo entregue

| Tarefa | Status |
|--------|--------|
| Service templates (5 tipos) | OK — `provisioning-templates.ts` + DB seed |
| POST `/api/provisioning/preview` | OK |
| Estados draft → validated → pending_approval → approved | OK |
| UI `/provisioning` wizard | OK |
| Apply bloqueado + audit `provisioning_execute_blocked` | OK |
| Export plano Markdown | OK — preview + `/report` |
| Docs workflow | OK |

## Arquivos principais

- `workspace/artifacts/api-server/src/modules/netops/provisioning-templates.ts`
- `workspace/artifacts/api-server/src/modules/netops/provisioning-preview.service.ts`
- `workspace/artifacts/api-server/src/modules/netops/provisioning-template-seed.ts`
- `workspace/artifacts/api-server/src/routes/provisioning.ts`
- `workspace/artifacts/netops-manager/src/pages/provisioning.tsx`
- `workspace/artifacts/netops-manager/src/lib/provisioning-api.ts`
- `docs/PROVISIONING_PREVIEW_WORKFLOW.md`

## Limitações v0.4.0

- Preview Huawei VRP simplificado (não substitui engenharia completa)
- Compliance crítico não bloqueia approve automaticamente (recomendado v0.5)
- Execute com apply habilitado ainda usa SSH Cisco-style em path legado — não usar em produção Huawei até FASE apply controlada
- Sem RBAC granular por ação de approve (usa auth global existente)

## Recommendation — apply controlado (v0.5+)

1. Gate: `CONFIG_APPLY_ENABLED` + `MAINTENANCE_WINDOW_ENFORCED` + role `provisioner`
2. Substituir execute SSH por adapter Huawei allowlist + dry-run diff
3. Persistir `before_config` / `after_config` em `provisioning_steps`
4. Integrar compliance findings blocking em `validate`
5. Dual approval para jobs `l3vpn_vrf` e BGP upstream

## Validação

```bash
cd workspace && pnpm run typecheck
BASE_PATH=/ PORT=5000 pnpm run build
curl -s http://127.0.0.1:8085/api/provisioning/service-templates
curl -s -X POST http://127.0.0.1:8085/api/provisioning/preview -H 'Content-Type: application/json' -d '{"deviceId":1,"serviceType":"l3vpn_vrf","parameters":{"vrfName":"X","rd":"1:1","interfaceName":"GE0/0/1","peCeAddress":"10.0.0.1/30"}}'
```

Após deploy: `bash tools/apply-containers.sh api web`
