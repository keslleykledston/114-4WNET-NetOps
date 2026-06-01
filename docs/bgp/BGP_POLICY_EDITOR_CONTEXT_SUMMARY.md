# BGP Policy Editor Context Summary

## Estado atual

The BGP Policy Editor exists as a **read-only shell** embedded in `BGP Drilldown`, with an optional backend preview integration that mirrors the local normalized preview.

## What is in scope

- Open from the peer context inside BGP Drilldown.
- Show import route-policy nodes for the selected peer.
- Allow local-only community editing in a nested modal.
- Show a normalized preview for pending node changes.
- Show a disabled apply action and a disabled or hidden rollback action.
- Attempt a backend dry-run preview for the same normalized contract and fall back locally when needed.
- Show preview origin badges and drift warnings when backend and local results diverge.

## What is out of scope

- No backend write.
- No apply endpoint.
- No rollback endpoint.
- No migration.
- No SSH command execution.
- No provisioning changes.
- No parser/compliance changes.
- No persistence of preview results.

## Reused data

- `BgpPeerDrilldownResult`
- route-policy nodes and dependencies from drilldown payload
- community library items from discovery
- community sets from the current device
- backend preview endpoint can reuse the same drilldown snapshot and community sets without mutating state

## Normalized Preview

- Community selection is normalized locally before comparison.
- Order does not matter.
- Duplicate values are removed.
- Empty values are ignored.
- Exact matches produce a matched community-list name.
- Non-exact combinations are marked as `Customizado`.

## Community resolution rules

- Use the discovered community-list / community-set payload for exact matching.
- Compare normalized sets, not raw order.
- Return a confidence flag:
  - `exact`
  - `custom`
  - `empty`
  - `no-library`

## Local findings

- `COMMUNITY_LIST_NOT_FOUND`
- `COMMUNITY_LIST_EMPTY`
- `COMMUNITY_COMBINATION_CUSTOM`
- `COMMUNITY_COMBINATION_MATCHED`
- `NODE_NOT_FOUND`
- `NODE_UNSUPPORTED_ACTION`
- `ROUTE_POLICY_NOT_FOUND`
- `IMPORT_POLICY_NOT_BOUND`
- `SNAPSHOT_STALE`
- `APPLY_DISABLED`
- `ROLLBACK_DISABLED`

## Backend preview contract

- Endpoint: `POST /api/bgp/peers/:deviceId/:peer/policy-editor/preview`
- Request: `{ routePolicyName?: string | null, nodeEdits: [{ nodeId, selectedCommunities[] }] }`
- Response: normalized preview with per-node diff, findings, and safety.
- Safety is always read-only:
  - `applyDisabled: true`
  - `rollbackDisabled: true`
  - `dryRun: true`
- No write path, no persistence, and no provisioning changes.

## UI integration

- The modal now tries the backend preview on `Gerar preview`.
- If backend preview fails, the shell keeps the local preview and adds a `BACKEND_PREVIEW_UNAVAILABLE` finding.
- If backend preview diverges from the local normalized result, the shell adds `PREVIEW_DRIFT_DETECTED`.
- The visible badge can be `Preview backend`, `Preview local`, or `Preview local fallback`.
- Apply and rollback remain disabled in every mode.

## Observability mínima

- Lightweight preview events exist only for safe preview telemetry:
  - `preview_backend_success`
  - `preview_backend_failed`
  - `preview_local_used`
  - `preview_local_fallback_used`
  - `preview_drift_detected`
- Safe fields for preview events:
  - `deviceId`
  - `peer`
  - `routePolicyName`
  - `previewSource`
  - `driftDetected`
  - `findings` codes
  - `timestamp`
  - `backendErrorKind` classification only
- Do not log:
  - full config
  - raw SSH output
  - secrets
  - tokens
  - passwords
  - command payloads
- The modal also shows a small visible summary for:
  - last preview origin
  - drift status
  - last backend error
  - safety flags
- Drift detection remains advisory and never blocks the user.

## Main files

- `workspace/artifacts/netops-manager/src/pages/bgp-peer-drilldown.tsx`
- `workspace/artifacts/netops-manager/src/features/bgp/bgp-peer-context-card.tsx`
- `workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor-modal.tsx`
- `workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-community-editor-modal.tsx`
- `workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor.types.ts`
- `workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor.utils.ts`
- `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-policy-editor.types.ts`
- `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-policy-editor.utils.ts`
- `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-policy-editor.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-policy-editor.controller.ts`

## Safety gates

- `BGP_POLICY_EDITOR_ENABLED = true` in the local shell feature file only.
- Apply real stays disabled.
- Rollback real stays disabled.
- The editor is a local preview shell only.

## Known limitations

- Raw config is reconstructed from the snapshot payload when the source config is not available in the UI payload.
- Community matching is done locally against discovered community sets.
- Preview remains local-first, with backend dry-run support now available as an optional integration.
- Pending changes are not persisted.

## Last phase status

Phase 6 added lightweight preview observability and a visible safety summary while keeping fallback local and read-only behavior intact.
