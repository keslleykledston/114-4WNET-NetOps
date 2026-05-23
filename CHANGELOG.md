# Changelog

## v0.3.5 — Compliance Profile Assignment (In Development)

- Added compliance profile assignment per device (complianceProfileName field)
- Created 6 compliance profiles: observe-only, lab, edge-balanced, access-balanced, edge-strict, access-strict
- Implemented role-to-profile defaults (RX → edge-balanced, access → access-balanced, lab → observe-only, etc)
- Added database migration for compliance_profile_name column
- Created compliance profile specification with rules, thresholds, recommendations per profile
- Improved recommendations with technical, operational, actionability, and escalation guidance
- Added selftest validating profile assignment and defaults
- Status: ✅ In Development (selftest 7/7 passing)

## v0.3.4 — Operational Pilot NOC (Completed)

- NOC operational readiness validation with 3 pilot devices.
- Device connectivity test (SSH + SNMP health check).
- Device discovery full workflow with interface/BGP/VLAN parsing.
- BGP peer inspection and route query on live peers.
- Compliance scan with balanced profile and findings export.
- Report download in markdown/JSON/CSV for compliance documentation.
- Audit log verification showing all operational actions.
- NOC operational checklist (pre-shift, daily ops, end-of-shift).
- Incident runbook covering connectivity, discovery, BGP, compliance, export issues.
- UX feedback checklist for operator satisfaction scoring.
- Operational pilot smoke test validating full workflow.
- Documentation: checklists, runbooks, feedback templates.
- Status: ✅ In Development

## v0.3.3 — Compliance Report Export

- Added compliance report download in Markdown, JSON, CSV formats for job reports.
- Added findings export endpoint with full dataset across jobs.
- Added groups export endpoint with aggregated findings by rule/policy/context.
- Added evidence sanitization removing passwords/tokens while preserving BGP communities.
- Added permission `compliance.export` with role defaults (admin=true, operator=true, viewer=false).
- Added audit logging for all export operations with sanitized event tracking.
- Added OpenAPI schemas and Orval client regeneration for export endpoints.
- Added frontend Download button in compliance jobs table.
- Added selftest suite validating all 3 export formats with 16 test cases.
- Status: ✅ Production Ready

## v0.3.0 — Gestão de usuários e autorizações

- Tela `/users` com CRUD de usuários.
- Permissões granulares por módulo.
- Reset de senha com token temporário.
- Session timeout configurável.
- Session revoke manual.
- Audit log de ações de usuário.
- Status: ✅ Completed

## v0.3.1 — Import/Export de dispositivos

- Import CSV/XLSX/TXT com preview pré-aplicação.
- Validação e deduplicação de IP/hostname.
- Proteção de credenciais no import.
- Export CSV/XLSX/JSON sem secrets.
- Histórico de imports com audit trail.
- Status: ✅ Completed

## v0.3.2 — Download/export de relatórios

- (Merged into v0.3.3)
- Status: ✅ Completed

## v0.3.4 Planned — Pilot operacional NOC

- Validação com operadores reais.
- Feedback de UX e performance.
- Dashboard de uptime.
- Alerts em tempo real para críticos.

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
