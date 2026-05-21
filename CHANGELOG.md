# Changelog

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
