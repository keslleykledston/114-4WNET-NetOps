# Provisioning Phase Status

## Phase

Provisioning MVP closure and migration-chain stabilization.

## Objective

Close the Provisioning MVP documentation and acceptance artifacts after confirming the legacy migration chain and runtime validations are green.

## Changes made

- Updated `workspace/lib/db/migrations/0035_resource_manager.sql` to match the live schema by removing the nonexistent `sites(id)` foreign key
- Validated the full migration chain with `migrate:safe`, which applied `0035_resource_manager.sql`, `0036_topology_intelligence.sql`, and `0037_impact_analysis.sql`
- Kept the Provisioning MVP runtime, API, and frontend unchanged
- Added the closure report and acceptance checklist for the stabilized Provisioning MVP

## Files altered

- `workspace/lib/db/migrations/0035_resource_manager.sql`
- `docs/provisioning/PROVISIONING_CONTEXT_SUMMARY.md`
- `reports/provisioning/PHASE_STATUS.md`
- `docs/provisioning/PROVISIONING_MVP_NEXT_STEPS.md`
- `reports/provisioning/PROVISIONING_MVP_STABILIZATION_CLOSURE_REPORT.md`
- `reports/provisioning/PROVISIONING_MVP_ACCEPTANCE_CHECKLIST.md`

## Tests executed

- `git diff --check`
- `cd workspace && DATABASE_URL=postgresql://netops:netops@127.0.0.1:5435/netops pnpm --filter @workspace/db run migrate:safe`
- `docker compose ps`
- `curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:8085/api/healthz`
- `curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:3005/`
- `curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:8085/api/provisioning/templates`
- `node tools/provisioning/provisioning-regression-suite.mjs`
- `node tools/secrets-leak-selftest.mjs`

## Tests pending

- None for the current closure scope

## Risks

- The resource manager now stores `site_id` without FK enforcement, which matches the current schema but does not validate site existence
- Any future introduction of a real `sites` table will need a separate migration strategy to avoid breaking the already-applied chain
- The provisioning MVP remains unaffected by this database correction
- Future feature work may require reopening acceptance and closure artifacts

## Blockers

- None for the migration chain after this correction

## Next steps

1. Keep the Provisioning MVP regression suite and runtime checks as-is.
2. Reopen only if new feature work changes provisioning scope or resource-manager ownership semantics.
3. Continue phase-by-phase documentation and regression maintenance.
