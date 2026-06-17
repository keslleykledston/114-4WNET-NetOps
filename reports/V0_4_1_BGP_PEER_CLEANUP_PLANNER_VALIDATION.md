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

## Hotfix: route-policies exclusivas agora entram no script

- O gerador de comandos do BGP cleanup passou a incluir `route-policy` marcada como `EXCLUSIVE` mesmo quando o plano é `partial`.
- Dependências `SHARED`, `GLOBAL` e `AMBIGUOUS` continuam fora do script.
- O modal de planejamento continua somente leitura; o script sugerido é apenas para revisão humana/cópia.
- O detalhe de change plan agora marca `route-policy` exclusiva como `Será removido: SIM`.

## Regras implementadas

- Peer `Established` bloqueia planejamento
- Twin IPv6/IPv4 ativo bloqueia planejamento
- Sem dependências -> `partial`
- Dependências exclusivas -> `full`
- Dependências compartilhadas -> `partial`
- Dependência ambígua -> `skip`
- Objetos compartilhados não entram no script
- Route-policies exclusivas entram no script mesmo quando há dependências compartilhadas em outros tipos
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
- `pnpm -C workspace --filter @workspace/api-server typecheck`
- `pnpm -C workspace --filter @workspace/netops-manager typecheck`
- `BASE_PATH=/ PORT=5000 pnpm -C workspace run build`
- `DOCKER_BUILDKIT=1 docker compose up -d --build api web`
- `docker compose ps`
- `curl -fsS http://127.0.0.1:8085/api/healthz`

## Observações

- O selftest auxiliar de provisioning-preview depende de `ADMIN_EMAIL` e `ADMIN_PASSWORD`.
- O selftest de compliance-community-filter-reference referencia uma fixture ausente no estado atual do repositório.
- Ambos foram registrados como limitações de validação local, sem impacto na feature nova.
