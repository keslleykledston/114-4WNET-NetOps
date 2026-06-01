# Provisioning MVP Stabilization Closure Report

## Executive Summary

The Provisioning MVP for `114-4WNET-NetOps` is implemented, stabilized, and validated in the live runtime. The module now supports structured L2VPN/L3VPN preview workflows, approval-aware handling, read-only-by-default safety gates, authenticated template registry access, and a consolidated regression suite. The legacy migration chain was also stabilized so `migrate:safe` completes successfully.

## Scope Delivered

- Structured provisioning MVP for L2VPN and L3VPN
- Preview, rollback preview, pre-check, approval, and blocked apply flow
- Safety gates with feature flags and default dry-run behavior
- Authenticated provisioning template registry checks
- Consolidated local regression scripts and phase memory docs
- Legacy migration-chain stabilization for `0035_resource_manager.sql`

## Main Files and Modules

- Backend provisioning module: `workspace/artifacts/api-server/src/modules/provisioning/`
- Legacy compatibility layer: `workspace/artifacts/api-server/src/modules/netops/provisioning*.ts`
- API routes: `workspace/artifacts/api-server/src/routes/provisioning.ts`
- Frontend page: `workspace/artifacts/netops-manager/src/pages/provisioning.tsx`
- DB schemas: `workspace/lib/db/src/schema/provisioning.ts`, `workspace/lib/db/src/schema/resource-manager.ts`
- Template registry: `workspace/artifacts/api-server/src/modules/provisioning/provisioning-template-registry.ts`
- Audit/report support: `workspace/lib/db/src/schema/audit.ts`, `workspace/lib/db/src/schema/reports.ts`

## Endpoints Added or Retained

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
- Legacy `/api/provisioning-jobs/*` endpoints retained for compatibility

## Feature Flags

- `PROVISIONING_PREVIEW_ENABLED=true`
- `PROVISIONING_APPLY_ENABLED=false`
- `PROVISIONING_ROLLBACK_ENABLED=false`
- `PROVISIONING_REQUIRE_APPROVAL=true`
- `PROVISIONING_DRY_RUN_DEFAULT=true`

Legacy compatibility flags still honored:

- `PROVISIONING_EXECUTE_ENABLED`
- `CONFIG_APPLY_ENABLED`
- `NETOPS_SNMP_REAL_ENABLED`
- `NETBOX_ENABLED`

## Safety Gates

- Apply real is blocked by default
- Rollback real is blocked by default
- Approval is required before apply
- Preview uses dry-run behavior by default
- Authentication remains required for protected provisioning routes
- RBAC remains enforced on management endpoints
- Secrets are masked or skipped in local leak checks

## Migrations Applied

- `0035_resource_manager.sql`
- `0036_topology_intelligence.sql`
- `0037_impact_analysis.sql`
- `0038_provisioning_service_preview_mvp.sql`

The `0035_resource_manager.sql` migration was corrected to remove a nonexistent `sites(id)` foreign key and align with the current Drizzle schema.

## Tools and Selftests Created or Updated

- `tools/provisioning/_shared.mjs`
- `tools/provisioning/provisioning-context-refresh.mjs`
- `tools/provisioning/provisioning-flags-selftest.mjs`
- `tools/provisioning/provisioning-findings-selftest.mjs`
- `tools/provisioning/provisioning-preview-l2vpn-selftest.mjs`
- `tools/provisioning/provisioning-preview-l3vpn-selftest.mjs`
- `tools/provisioning/provisioning-safety-selftest.mjs`
- `tools/provisioning/provisioning-docs-check.mjs`
- `tools/provisioning/provisioning-regression-suite.mjs`
- `tools/provisioning-preview-selftest.mjs`
- `tools/provisioning-template-registry-selftest.mjs`
- `tools/rbac-selftest.mjs`
- `tools/secrets-leak-selftest.mjs`

## Sub-Agents and Workflows Created

- `.cursor/agents/provisioning-context-maintainer.md`
- `.cursor/agents/provisioning-validator.md`
- `.cursor/agents/provisioning-security-reviewer.md`
- `.cursor/agents/provisioning-docs-writer.md`
- `.cursor/agents/provisioning-regression-runner.md`
- `.cursor/workflows/provisioning-context-refresh.md`
- `.cursor/workflows/provisioning-validation.md`
- `.cursor/workflows/provisioning-security-review.md`
- `.cursor/workflows/provisioning-docs-refresh.md`
- `.cursor/workflows/provisioning-regression.md`

## Validation Commands Executed

- `git diff --check`
- `cd workspace && pnpm run typecheck`
- `cd workspace && PORT=3000 BASE_PATH=/ pnpm run build`
- `cd workspace && DATABASE_URL=postgresql://netops:netops@127.0.0.1:5435/netops pnpm --filter @workspace/db run migrate:safe`
- `docker compose ps`
- `curl http://127.0.0.1:8085/api/healthz`
- `curl http://127.0.0.1:3005/provisioning`
- `node tools/provisioning/provisioning-regression-suite.mjs`
- `node tools/secrets-leak-selftest.mjs`

## Test Results

- `migrate:safe` completed successfully
- `typecheck` passed
- `build` passed
- `api`, `web`, and `db` are healthy
- `/api/healthz` returned `200`
- `/provisioning` returned `200`
- `provisioning-regression-suite` passed with `10 passed, 0 failed`
- `secrets-leak-selftest` passed with controlled skip behavior for missing connector bootstrap token

## Known Risks

- `site_id` in the resource manager remains a plain integer without FK enforcement, matching the current schema but not validating site existence
- Approval invalidation still depends on deterministic payload comparison
- Future scope changes may require reopening the stabilized closure artifacts

## Recommended Next Steps

1. Keep the Provisioning MVP regression suite and runtime checks as-is.
2. Only reopen the module if future feature work changes scope or safety assumptions.
3. Keep phase memory docs synchronized with any subsequent operational work.
