# Provisioning Context Summary

## Architecture

- Backend: `workspace/artifacts/api-server/src/modules/provisioning/`
- Legacy compatibility layer: `workspace/artifacts/api-server/src/modules/netops/provisioning*.ts`
- Frontend: `workspace/artifacts/netops-manager/src/pages/provisioning.tsx`
- DB schema: `workspace/lib/db/src/schema/provisioning.ts`
- Template registry: `workspace/artifacts/api-server/src/modules/provisioning/provisioning-template-registry.ts`
- Audit/report support: `workspace/lib/db/src/schema/audit.ts`, `workspace/lib/db/src/schema/reports.ts`

## Main files

- `workspace/artifacts/api-server/src/lib/env.ts`
- `workspace/artifacts/api-server/src/routes/provisioning.ts`
- `workspace/artifacts/api-server/src/modules/provisioning/provisioning.types.ts`
- `workspace/artifacts/api-server/src/modules/provisioning/provisioning-validator.ts`
- `workspace/artifacts/api-server/src/modules/provisioning/provisioning-preview.service.ts`
- `workspace/artifacts/api-server/src/modules/provisioning/provisioning-template-registry.ts`
- `workspace/artifacts/netops-manager/src/lib/provisioning-api.ts`
- `workspace/artifacts/netops-manager/src/pages/provisioning.tsx`

## Routes

Current compatibility and alias routes are centered under `/api/provisioning`:

- `GET /api/provisioning/templates`
- `GET /api/provisioning/jobs`
- `POST /api/provisioning/jobs`
- `GET /api/provisioning/jobs/:id`
- `PATCH /api/provisioning/jobs/:id`
- `POST /api/provisioning/jobs/:id/precheck`
- `POST /api/provisioning/jobs/:id/preview`
- `POST /api/provisioning/jobs/:id/approve`
- `POST /api/provisioning/jobs/:id/apply`
- `POST /api/provisioning/jobs/:id/report`

Legacy `/api/provisioning-jobs/*` routes remain in place.

## Schemas / tables

- `provisioning_jobs`
- `provisioning_steps`
- `provisioning_templates`
- `provisioning_template_versions`
- `provisioning_template_audit_logs`
- `audit_logs`
- `reports`
- `service_requests`
- `service_request_audit_logs`

## Feature flags

- `PROVISIONING_PREVIEW_ENABLED=true`
- `PROVISIONING_APPLY_ENABLED=false`
- `PROVISIONING_ROLLBACK_ENABLED=false`
- `PROVISIONING_REQUIRE_APPROVAL=true`
- `PROVISIONING_DRY_RUN_DEFAULT=true`

Legacy flags still in use for compatibility:

- `PROVISIONING_EXECUTE_ENABLED`
- `CONFIG_APPLY_ENABLED`
- `NETOPS_SNMP_REAL_ENABLED`
- `NETBOX_ENABLED`

## Current flow

1. Create a structured service request
2. Run pre-check against discovery and local records
3. Generate preview and rollback preview
4. Block apply until approval exists and flags allow it
5. Emit audit and report artifacts

## Decisions already made

- No parallel provisioning module
- No destructive schema migration
- No real apply by default
- Preview uses existing discovery/compliance data first
- Legacy endpoints remain available
- Templates stay command-only and registered

## Pending work

- More precise template syntax checks
- Additional regression coverage in local scripts
- Possible UI simplification if approval state grows

## Migration chain stabilization

- Cause: `0035_resource_manager.sql` referenced `sites(id)`, but the local schema does not define a `sites` table and `workspace/lib/db/src/schema/resource-manager.ts` models `site_id` as a plain integer.
- Correction applied: changed `site_id` in `0035_resource_manager.sql` from `INTEGER REFERENCES sites(id)` to plain `INTEGER` so the migration matches the live Drizzle schema.
- Risk: the `site_id` column remains a denormalized reference without FK enforcement, which matches the current schema and avoids introducing a dependency on a missing table.
- Result: `cd workspace && DATABASE_URL=postgresql://netops:netops@127.0.0.1:5435/netops pnpm --filter @workspace/db run migrate:safe` completed successfully and applied `0035_resource_manager.sql`, `0036_topology_intelligence.sql`, and `0037_impact_analysis.sql`.
- Next steps: keep this as a separate operational maintenance area if the resource manager later needs a real `sites` table or a different ownership model.

## Test commands

- `cd workspace && pnpm run typecheck`
- `cd workspace && PORT=3000 BASE_PATH=/ pnpm run build`
- `cd workspace && DATABASE_URL=postgresql://netops:netops@127.0.0.1:5435/netops pnpm --filter @workspace/db run migrate:safe`
- `cd workspace && DATABASE_URL=postgresql://netops:netops@127.0.0.1:5435/netops MIGRATIONS_DIR=/tmp/provisioning-migrations pnpm --filter @workspace/db run migrate:safe`
- `node tools/provisioning/provisioning-regression-suite.mjs`
- `ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=admin123456 node tools/provisioning-preview-selftest.mjs`
- `ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=admin123456 node tools/rbac-selftest.mjs`
- `ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=admin123456 node tools/provisioning-template-registry-selftest.mjs`
- `node tools/secrets-leak-selftest.mjs`
- `git diff --check`

## Risks

- Pre-existing typecheck/build failures outside provisioning
- Full migration chain previously blocked by unrelated `sites` relation error in `0035_resource_manager.sql`; that migration is now aligned with the schema and the chain applies successfully
- Approval invalidation needs stable JSON comparison
- Legacy and structured job models must stay compatible
- `tools/secrets-leak-selftest.mjs` has a controlled skip path when the connector bootstrap token is not returned in the current environment

## Last phase status

The structured provisioning MVP is implemented and the runtime is rebuilt on `api` and `web`. The authenticated regression phase aligned the RBAC execute-blocked assertion to the current 503 contract, authenticated the provisioning template registry selftest, kept the secrets leak selftest useful without requiring a bootstrap token fixture, and the migration-chain stabilization phase resolved `0035_resource_manager.sql`. The MVP is now in stabilized/closed state pending future feature work only.
