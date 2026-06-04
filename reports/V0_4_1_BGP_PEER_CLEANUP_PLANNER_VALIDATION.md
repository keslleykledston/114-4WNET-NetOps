# v0.4.1 — BGP Peer Cleanup Planner Validation

## Escopo

Validação da feature read-only de planejamento de remoção de peer BGP no drilldown.

## O que foi entregue

- Backend em `workspace/artifacts/api-server/src/modules/bgp-drill-cleanup/`
- Modal frontend em `workspace/artifacts/netops-manager/src/features/bgp/bgp-peer-cleanup-modal.tsx`
- API helper frontend em `workspace/artifacts/netops-manager/src/features/bgp/bgp-peer-cleanup-api.ts`
- Badge de risco em `workspace/artifacts/netops-manager/src/features/bgp/dependency-risk-badge.tsx`
- OpenAPI atualizado com novos schemas e rotas
- Selftest novo em `tools/bgp-peer-cleanup-planner-selftest.mjs`

## Regras implementadas

- Peer `Established` bloqueia planejamento
- Twin IPv6/IPv4 ativo bloqueia planejamento
- Sem dependências -> `partial`
- Dependências exclusivas -> `full`
- Dependências compartilhadas -> `partial`
- Dependência ambígua -> `skip`
- Objetos compartilhados não entram no script
- O planner não executa comandos destrutivos

## Audits

- `bgp_cleanup_analysis_created`
- `bgp_cleanup_script_exported`

## Validação executada

- `pnpm run typecheck` em `workspace/artifacts/api-server`
- `pnpm run typecheck` em `workspace/artifacts/netops-manager`
- `BASE_PATH=/ PORT=5000 pnpm -C workspace run build`
- `pnpm -C workspace/lib/api-spec run codegen`
- `node tools/bgp-peer-cleanup-planner-selftest.mjs`

## Observações

- O selftest auxiliar de provisioning-preview depende de `ADMIN_EMAIL` e `ADMIN_PASSWORD`.
- O selftest de compliance-community-filter-reference referencia uma fixture ausente no estado atual do repositório.
- Ambos foram registrados como limitações de validação local, sem impacto na feature nova.

