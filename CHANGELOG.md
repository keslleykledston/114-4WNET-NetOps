# Changelog

## v0.5.1 — Connector Agent Container (2026-05-28)

- Phase 2: `infra/connector-agent/` Python agent (Docker, host network, read-only jobs).
- Heartbeat, job poll, PING/TCP/SSH/SNMP/WG executors, security policy, healthcheck.
- Selftest: `tools/connector-agent-selftest.py`.

## v0.5.0 — Connectors / Bastion (2026-05-28)

- Connectors module: WireGuard transport + Connector Agent API (heartbeat, job queue).
- DB: `tenants`, `connectors`, `connector_networks`, `connector_jobs`, `connector_job_results`, `connector_heartbeats`, `devices.connector_id`.
- Management UI: **Infraestrutura → Conectores** (`/infrastructure/connectors`).
- Security: per-connector token (hashed), encrypted WG private keys, read-only SSH policy on jobs.
- Agent endpoints (Bearer token): `POST /connectors/heartbeat`, `GET /connectors/jobs/pending`, `POST /connectors/jobs/:id/result`.
- Docs: `docs/connectors/`, report `reports/connectors/PHASE_1_IMPLEMENTATION_REPORT.md`.
- Selftest: `tools/connectors-selftest.mjs`.

## v0.4.0 — Provisioning Preview Engine (2026-05-28)

- Added safe provisioning preview module (`workspace/artifacts/api-server/src/modules/provisioning/`).
- New endpoints: `GET /api/provisioning/templates`, `GET /api/provisioning/templates/:id`, `POST /api/provisioning/preview`, `POST /api/provisioning/preview/export`.
- Nine Huawei VRP service templates (BGP, L3VPN, L2VPN, subinterface, route-policy, community, prefix-list).
- Validations: required parameters, ASN/IP/VLAN, vendor/platform, discovery conflict hints (warnings).
- Permission `provisioning.read` for viewer/operator/admin.
- Audit actions: `provisioning_preview_created`, `provisioning_preview_export`.
- Sensitive parameters masked in preview/export/audit.
- Selftest: `tools/provisioning-preview-selftest.mjs`.
- Docs: `docs/PROVISIONING_PREVIEW_ENGINE.md`, `docs/PROVISIONING_TEMPLATE_MODEL.md`.
- Apply remains blocked: `CONFIG_APPLY_ENABLED=false`.

## v0.3.7 — NetBox Real Lab Validation (Planned)

- NetBox read-only API integration with connection testing
- Device synchronization preview showing match predictions (netboxId, hostname)
- Dry-run sync validation protecting against unintended device creation
- Field mapping: NetBox device → local device with vendor, platform, role, site
- Audit logging for all NetBox operations with sanitized event tracking
- RBAC enforcement: admin-only sync permissions, viewer status access
- Comprehensive runbook (docs/NETBOX_LAB_RUNBOOK.md) covering configuration, testing, troubleshooting
- Selftest validating 9 core operations: status, connection, devices, sites, preview, sync, audit, permissions, errors
- Validation report with architecture decisions, risk assessment, production deployment checklist
- Status: ✅ Specification Complete, Implementation Ready, Lab Validation Approved

## v0.3.6 — Audit & Activity Center (Planned)

- Comprehensive audit log browsing interface (/audit-center page)
- Advanced filtering: actor, action, date, severity, sourceIp, objectType
- Audit summary API with statistics and sensitive event detection
- Event severity classification (6 levels: info, operational, security, admin, export, failed)
- CSV/JSON export with automatic sanitization (no secrets exposed)
- Permission model: audit.read for viewing, audit.export for downloads
- 13 sensitive event types tracked: login_failed, user_disabled, password_reset, etc.
- Alert thresholds: 5+ failed logins in 10min, unusual exports, sensitive changes
- Selftest validating API filtering, export, and permission enforcement
- Status: ✅ Specification Complete, Implementation Ready

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
