# MVP Critical Gaps Closure

## Summary

- Safe apply/rollback guards added.
- Audit logs, reports, and integrations endpoints added.
- Frontend pages for `/audit`, `/reports`, and `/integrations` added.
- Missing production indexes applied to the live database.
- Smoke validation passed.

## Files Created

- `workspace/lib/db/migrations/0003_mvp_critical_gaps.sql`
- `workspace/artifacts/api-server/src/lib/audit.ts`
- `workspace/artifacts/api-server/src/lib/env.ts`
- `workspace/artifacts/api-server/src/modules/netops/provisioning.service.ts`
- `workspace/artifacts/api-server/src/routes/audit.ts`
- `workspace/artifacts/api-server/src/routes/integrations.ts`
- `workspace/artifacts/api-server/src/routes/reports.ts`
- `workspace/artifacts/netops-manager/src/pages/audit.tsx`
- `workspace/artifacts/netops-manager/src/pages/reports.tsx`
- `workspace/artifacts/netops-manager/src/pages/integrations.tsx`
- `docs/MVP_CLOSURE_PLAN.md`
- `docs/APPLY_DRY_RUN_SAFETY.md`
- `docs/AUDIT_LOG_MODEL.md`
- `docs/REPORTS_MODEL.md`
- `docs/INTEGRATIONS_READINESS.md`

## Validation

- `pnpm -C workspace --filter @workspace/api-server typecheck`
- `pnpm -C workspace --filter @workspace/netops-manager typecheck`
- `BASE_PATH=/ PORT=5000 pnpm -C workspace run build`
- `node tools/device-discovery-selftest.mjs`
- `docker compose run --rm migrate`
- `curl http://127.0.0.1:8085/api/healthz`
- `curl http://127.0.0.1:8085/api/audit-logs`
- `curl http://127.0.0.1:8085/api/reports`
- `curl http://127.0.0.1:8085/api/integrations`
- `POST /api/provisioning-jobs/1/execute` blocked as expected
- `POST /api/provisioning-jobs/1/rollback` blocked as expected

## Remaining Risks

- real apply remains intentionally disabled by default.
- NetBox integration is readiness-only.
- Huawei parser coverage still needs additional real-world cases.

