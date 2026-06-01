# BGP Policy Editor Phase Status

## Fase atual

Phase 6 - BGP Policy Editor preview observability and safety summary inside BGP Drilldown

## Objetivo

Provide a read-only editor shell for BGP import policies with normalized preview, backend dry-run integration, local fallback, and safe observability, without backend write.

## Alterações feitas

- Added an `Editar policy` entry point in BGP Drilldown.
- Added a modal for import policy nodes.
- Added a nested community editor modal.
- Added local before/after preview for pending node edits.
- Added normalized preview, findings, and local diff rendering.
- Added a backend preview endpoint that mirrors the normalized contract and stays read-only.
- Added backend preview types, utilities, and service/controller wiring.
- Added `dryRun` to the safety contract.
- Connected the shell to the backend preview with local fallback.
- Added drift detection between local and backend preview results.
- Added preview-origin badges and backend-unavailable warnings.
- Added lightweight preview observability events and visible summary tiles.
- Kept observability payloads safe: device, peer, route policy, preview source, drift flag, finding codes, timestamp, and backend error classification only.
- Added a visible last-preview summary for origin, drift, backend error, and safety flags.
- Preserved the existing navigation bridge and provisioning safety posture.

## Arquivos alterados

- `workspace/artifacts/netops-manager/src/pages/bgp-peer-drilldown.tsx`
- `workspace/artifacts/netops-manager/src/features/bgp/bgp-peer-context-card.tsx`
- `workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor.types.ts`
- `workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor.utils.ts`
- `workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor-observability.ts`
- `workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor-api.ts`
- `workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor-modal.tsx`
- `workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-community-editor-modal.tsx`
- `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-policy-editor.types.ts`
- `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-policy-editor.utils.ts`
- `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-policy-editor.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-policy-editor.controller.ts`
- `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown.routes.ts`
- `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown.controller.ts`

## Testes executados

- `git diff --check`
- `cd workspace && pnpm run typecheck`
- `cd workspace && PORT=3000 BASE_PATH=/ pnpm run build`
- `node tools/bgp-peer-parser-selftest.mjs`
- `node tools/bgp-peer-dependency-selftest.mjs`
- `node tools/bgp-drilldown-cache-ux-selftest.mjs`
- `node tools/device-discovery-selftest.mjs`
- `node tools/provisioning/provisioning-regression-suite.mjs`
- `node tools/bgp-navigation-context-bridge-selftest.mjs`
- `node tools/bgp-policy-editor/bgp-policy-editor-shell-selftest.mjs`
- `node tools/bgp-policy-editor/bgp-policy-editor-preview-selftest.mjs`
- `node tools/bgp-policy-editor/bgp-policy-editor-backend-preview-selftest.mjs`
- `node tools/bgp-policy-editor/bgp-policy-editor-preview-integration-selftest.mjs`
- `node tools/bgp-policy-editor/bgp-policy-editor-observability-selftest.mjs`

## Testes pendentes

- Runtime smoke passed in the validated environment; it may still skip in lab setups without API/credentials/suitable snapshot.

## Riscos

- nested dialog complexity
- reconstructed raw config may not match the full runtime source
- pending edits are local only
- preview normalization depends on discovered community-set fidelity

## Bloqueios

- No backend write allowed in this phase.
- No apply endpoint.
- No rollback endpoint.
- No persistence of preview results.
- No OpenAPI change was required for this phase.

## Próximos passos

- keep the editor anchored in BGP Drilldown
- only add richer telemetry if a real sink exists and the fields remain safe
- deepen fixture coverage if more realistic peer/community data becomes available
