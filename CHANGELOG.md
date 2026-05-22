# Changelog

## v0.2.4 Compliance Profundo

- Added structured compliance engine based on persisted `discovery_snapshot`.
- Added enriched compliance findings with source, confidence, object, recommendation, and sanitized evidence.
- Added Huawei VRP default checks for security, NTP, interfaces, VRF/L3VPN, BGP, and L2VPN.
- Updated scheduled compliance to reuse the new engine and handle missing snapshots with controlled warnings.
- Added `/compliance-findings`, OpenAPI/Orval support, improved `/compliance` UI, and deep compliance selftest.

## v0.2.3 NetBox Read-Only Sync

- Added NetBox read-only status, connection test, list, preview, and local sync endpoints.
- Added frontend NetBox controls in `/integrations`.
- Added RBAC rules: viewer status, operator test/list/preview, admin sync-local.
- Added token-safe env-based NetBox config and sanitized audit events.
- Added NetBox field mapping and security documentation.

## Device Discovery Phase

- Added read-only device discovery API with SSH primary and SNMP fallback/complement.
- Added normalized BGP peer details and protected route query endpoints.
- Added sanitized raw evidence storage for discovery runs.
- Added frontend discovery panel and changed BGP views to consume structured discovery peer data.
- Extended Huawei VRP read-only allowlist for discovery commands.
- Changed discovery inventory priority to SNMP for BGP peers/interfaces, with SSH used for details.
- Persisted normalized discovery snapshots to local DB and preserved missing known items as candidate removals.
- Added dedicated Drizzle schema and idempotent SQL migration for `discovery_runs`, `discovery_snapshots`, and `discovery_evidence`.
- Updated OpenAPI and regenerated the React Query client for discovery endpoints.
- Improved Huawei VRP parsing for route-policy nodes, community filters/lists and basic L2VC/VSI facts.

## MVP Critical Gaps Closure

- Added safe provisioning guards with `CONFIG_APPLY_ENABLED=false` and `DRY_RUN_DEFAULT=true`.
- Added `audit_logs`, `reports`, and `integration_settings` schemas, endpoints, and frontend pages.
- Added sanitized audit trail logging for device, discovery, compliance, template, and provisioning actions.
- Added provisioning job Markdown reports.
- Added readiness-only integrations for NetBox, webhook, and Zabbix placeholders.
- Applied missing production indexes for discovery and device lookup tables.
- Stabilized Docker rebuilds with BuildKit cache mount, manifest-first pnpm install, and tighter `.dockerignore`.

## v0.2.0 RBAC Local

- Added local auth with `viewer`, `operator`, and `admin` roles.
- Added `users` and `user_sessions` tables.
- Added `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, and admin-only user management endpoints.
- Added request authorization middleware and actor-aware audit logs.
- Added frontend login/logout flow with protected routes.

## v0.2.2 Scheduler

- Added local scheduler for discovery, compliance, and health checks.
- Added `scheduled_jobs`, `scheduled_job_runs`, and `scheduled_job_run_items`.
- Added scheduler API, audit trail, and frontend `/scheduler` page.
- Added OpenAPI/Orval coverage for scheduled jobs and runs.
