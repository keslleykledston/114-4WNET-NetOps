# BGP Customer Registry Existing Code Audit

- Date: 2026-07-06
- Scope: `docs/CADASTRO_BGP.md`
- Goal: map what already exists for the BGP customer registry / announcement-control work and avoid duplicate implementation.

## Summary

The repository already has a mature BGP announcement engine and operational BGP discovery stack. There is no dedicated customer registry module yet, so the right path is to add a thin customer-first registry layer on top of the existing announcement matrix, not a parallel engine.

## What already exists and should be reused

### Backend

- `workspace/artifacts/api-server/src/modules/bgp-announcements/`
- `workspace/artifacts/api-server/src/modules/bgp-drill-cleanup/`
- `workspace/artifacts/api-server/src/modules/bgp-drilldown/`
- `workspace/artifacts/api-server/src/modules/operational-bgp/`
- `workspace/artifacts/api-server/src/modules/netops/device-discovery/`
- `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/`

Existing announcement engine pieces:

- snapshot generation
- refresh flow
- latest matrix
- history/timelapse
- community resolver
- prefix expansion
- preview change
- change plans
- approval gate
- dry-run execution
- postcheck
- rollback dry-run
- rollback postcheck

### Database

Existing BGP-related schema already in place:

- `workspace/lib/db/src/schema/bgp_announcements.ts`
- `workspace/lib/db/src/schema/operational_bgp.ts`
- `workspace/lib/db/src/schema/bgp_peer_drilldown_snapshots.ts`
- `workspace/lib/db/src/schema/bgp_peer_role_overrides.ts`
- `workspace/lib/db/src/schema/bgp_peer_cleanup_analyses.ts`

### Frontend

Existing BGP UI already in place:

- `workspace/artifacts/netops-manager/src/pages/bgp-announcements.tsx`
- `workspace/artifacts/netops-manager/src/pages/operational-bgp.tsx`
- `workspace/artifacts/netops-manager/src/pages/bgp-peer-drilldown.tsx`
- `workspace/artifacts/netops-manager/src/features/bgp/*`
- `workspace/artifacts/netops-manager/src/features/bgp-drilldown/*`

### Tests and validation

Existing selftests already cover the BGP announcement engine:

- `tools/bgp-announcement-full-suite.mjs`
- `tools/bgp-announcement-preview-compiler-selftest.mjs`
- `tools/bgp-announcement-change-plan-selftest.mjs`
- `tools/bgp-announcement-approval-gate-selftest.mjs`
- `tools/bgp-announcement-dry-run-execution-selftest.mjs`
- `tools/bgp-announcement-postcheck-selftest.mjs`
- `tools/bgp-announcement-rollback-selftest.mjs`
- `tools/bgp-announcement-timelapse-selftest.mjs`

## What is missing

- No `bgp_customers` registry schema
- No `bgp_customer_connections`
- No `bgp_authorized_prefixes`
- No `bgp_exit_points`
- No `bgp_exit_community_actions`
- No `bgp_registry_audit_log`
- No `/api/bgp/registry` backend module
- No `/bgp/customers`, `/bgp/exits`, `/bgp/announcement-control` pages
- No customer-first orchestration layer that maps registry data into the existing announcement matrix

## Implementation direction

1. Keep the existing announcement engine as source of truth for preview/change-plan/dry-run/postcheck/rollback.
2. Add a registry layer for customers, connections, prefixes, exits, and community actions.
3. Use the registry layer to translate raw communities into operator-friendly labels.
4. Keep apply real blocked by default and preserve the current safety gates.
5. Expose the operational view as a customer-first UI, not a new engine.

## Risk notes

- The repo already has uncommitted local work in docs/UX files. Avoid overwriting those files.
- The requested registry feature is larger than a single patch if done end-to-end.
- The safe first delivery is schema + API skeleton + audit/logging + UI entry points on top of existing announcement services.

