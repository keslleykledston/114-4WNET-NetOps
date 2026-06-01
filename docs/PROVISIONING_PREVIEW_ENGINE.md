# Provisioning Preview Engine

## Purpose

The provisioning preview engine builds a safe, read-only rendering of planned network changes before any apply action is allowed. It is the main boundary between service intent and device configuration.

This repo already has a legacy preview flow. The current MVP extends it with a structured L2VPN/L3VPN preview path while keeping the old endpoints and job model compatible.

## Current architecture

- API module: `workspace/artifacts/api-server/src/modules/provisioning/`
- Legacy compatibility layer: `workspace/artifacts/api-server/src/modules/netops/provisioning*.ts`
- Frontend entry: `workspace/artifacts/netops-manager/src/pages/provisioning.tsx`
- DB source of truth: `workspace/lib/db/src/schema/provisioning.ts`
- Template source: `workspace/artifacts/api-server/src/modules/provisioning/provisioning-template-registry.ts`

## Inputs

The preview engine accepts:

- service type: `l2vpn` or `l3vpn`
- target devices
- structured parameters
- optional tenant/customer metadata
- optional maintenance window fields retained for compatibility
- template metadata and version

The preview must never require free-form command input.

## What the engine produces

- `validationResultJson`
- `renderedConfigJson`
- `renderedRollbackJson`
- `renderedValidationJson`
- `riskSummaryJson`
- structured findings with blocking flags
- a Markdown export for human review

## Structured findings

The current MVP uses explicit codes instead of unstructured messages:

- `VLAN_CONFLICT`
- `SUBINTERFACE_EXISTS`
- `INTERFACE_NOT_FOUND`
- `L2VC_ID_CONFLICT`
- `VSI_NAME_CONFLICT`
- `VRF_CONFLICT`
- `RD_CONFLICT`
- `RT_CONFLICT`
- `BGP_PEER_EXISTS`
- `ROUTE_POLICY_MISSING`
- `PREFIX_LIST_MISSING`
- `COMMUNITY_FILTER_MISSING`
- `TEMPLATE_MISSING`
- `CONNECTOR_UNAVAILABLE`
- `DEVICE_UNREACHABLE`
- `SNAPSHOT_STALE`
- `APPROVAL_REQUIRED`
- `APPLY_DISABLED`

Each finding carries:

- severity
- message
- evidence
- recommendation
- blocking

## Data sources

The engine prefers local data in this order:

1. Local DB records and job state
2. Discovery snapshots already stored in the platform
3. Parsed discovery data for interfaces, BGP, route policies, and L2 state
4. Connector metadata, if the target device is connector-backed
5. NetBox read-only data only when already integrated

## Safety gates

- Preview is allowed by default
- Apply remains blocked unless explicitly enabled by feature flag
- Rollback remains blocked unless explicitly enabled by feature flag
- Approval is required before apply
- Approval is invalidated if parameters change
- Commands are rendered only from registered templates

## Current status

The MVP now supports structured L2VPN and L3VPN preview paths. Runtime validation still depends on the local container rebuild and the current workspace lockfile state.
