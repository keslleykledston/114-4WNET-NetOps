# Provisioning MVP - Next Steps

## Estado atual

The provisioning MVP now has structured L2VPN/L3VPN preview support, safety gates, approval-aware job handling, a compatibility path for legacy endpoints, and a rebuilt live runtime on `api` and `web`. The migration-chain stabilization phase has also resolved the old `0035_resource_manager.sql` dependency on a missing `sites` table. The MVP is closed from a stabilization perspective.

## Fase concluída

- Structured preview path for L2VPN and L3VPN
- Feature-flag expansion for provisioning safety
- Preview findings and rollback preview support
- Alias endpoints under `/api/provisioning/jobs`
- Frontend flow updated to accept structured service requests
- Runtime typecheck/build stabilization
- Targeted safe application of `0038_provisioning_service_preview_mvp.sql`
- Container rebuild for `api` and `web`
- Authenticated regression closure for RBAC, template registry, and secrets-leak selftests
- Migration-chain stabilization for `0035_resource_manager.sql`
- Final closure documentation and acceptance checklist published

## Próxima fase recomendada

1. If resource manager semantics need stricter site validation later, design that as a separate phase.
2. If the provisioning scope grows, reopen this module with a new feature phase rather than extending the stabilized closure artifacts.

## Backlog técnico

- Improve validation coverage for interface, VLAN, RD/RT, and BGP peer conflicts
- Add more vendor/platform templates only if they are backed by discovery data
- Consider a dedicated approval UI state if the current panel becomes too dense
- Reconcile legacy and structured job models once the new flow is stable
- Keep resource-manager ownership/scope handling separate from the provisioning MVP
- Keep closure documentation in sync with future phase work

## Riscos

- `tools/secrets-leak-selftest.mjs` now skips the missing bootstrap-token branch rather than failing; this should be made explicit if future coverage needs the token fixture
- Approval invalidation based on payload comparison must remain deterministic
- Legacy and structured provisioning paths can diverge if not documented together
- Future changes could reopen the stabilized state and require a new acceptance pass

## Testes obrigatórios antes do próximo merge

- `cd workspace && pnpm run typecheck`
- `cd workspace && PORT=3000 BASE_PATH=/ pnpm run build`
- `cd workspace && DATABASE_URL=postgresql://netops:netops@127.0.0.1:5435/netops MIGRATIONS_DIR=/tmp/provisioning-migrations pnpm --filter @workspace/db run migrate:safe`
- `docker compose up -d --build --no-deps --force-recreate api web`
- `ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=admin123456 node tools/provisioning-preview-selftest.mjs`
- `node tools/provisioning/provisioning-regression-suite.mjs`
- `git diff --check`
