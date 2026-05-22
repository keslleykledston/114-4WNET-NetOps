# MVP Closure Plan

## Objective

Close the critical MVP gaps without enabling real configuration apply by default.

## Safety Rules

- `CONFIG_APPLY_ENABLED=false` by default.
- `DRY_RUN_DEFAULT=true` by default.
- No real apply without explicit enablement.
- No real rollback without explicit enablement.
- No free-form commands from the frontend.
- No secrets in logs, audit metadata, or reports.

## Closed Scope

- sanitized audit trail
- provisioning job Markdown reports
- readiness-only integrations
- required production indexes
- `/audit`, `/reports`, and `/integrations`

## Out of Scope

- NetBox sync real
- full RBAC
- scheduler UI
- production apply path

## Hardening Final

- formal Huawei fixtures added for parser coverage
- audit/report export added
- acceptance validation checklist recorded in `reports/MVP_ACCEPTANCE_VALIDATION.md`
- Docker rebuild stabilized with manifest-first install + BuildKit pnpm cache
