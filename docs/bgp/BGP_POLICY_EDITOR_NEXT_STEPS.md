# BGP Policy Editor - Next Steps

## Estado atual

The policy editor is a read-only shell inside BGP Drilldown with local-state community editing, optional backend dry-run preview integration, and lightweight safe observability.

## Fase concluída

- Entry button added in BGP Drilldown.
- Modal 1 implemented for import policy nodes.
- Modal 2 implemented for community edits.
- Local before/after preview added.
- Normalized preview layer added with findings and resolution rules.
- Backend preview endpoint added for the same normalized contract.
- UI now attempts backend preview and falls back locally on failure.
- UI now emits safe preview observability and shows last-preview summary tiles.
- Apply and rollback remain disabled.

## Próxima fase recomendada

Next steps should focus on hardening and observability rather than write enablement:

- richer candidate selection when the snapshot contains multiple import policies
- stronger peer/policy fixture coverage for runtime preview tests
- compare backend preview output against the local contract for drift
- decide whether to surface preview origin more prominently in drilldown header
- extend preview observability to aggregate usage patterns in a real telemetry sink if the project later adds one
- keep the observability payload limited to safe metadata only

## Backlog técnico

- better raw-config reconstruction when the snapshot does not contain enough evidence
- stronger community-list normalization rules
- shared peer context component extraction if reuse expands
- accessibility review for nested modal focus handling
- optional cached preview history if repeated comparisons become useful

## Riscos

- nested modal complexity
- relying on reconstructed raw config for nodes without full source evidence
- user confusion if import/export context is not labeled carefully
- false confidence if a stale snapshot is used for preview
- runtime preview endpoint must remain read-only and never persist state
- backend preview may be unavailable in some lab setups, so local fallback must stay healthy
- observability must not log full config, raw SSH output, secrets, tokens, passwords, or command payloads
- drift and telemetry are advisory only and must never block the user

## Testes obrigatórios antes do próximo merge

- `cd workspace && pnpm run typecheck`
- `cd workspace && PORT=3000 BASE_PATH=/ pnpm run build`
- `node tools/bgp-policy-editor/bgp-policy-editor-observability-selftest.mjs`
- `node tools/bgp-policy-editor/bgp-policy-editor-shell-selftest.mjs`
- `node tools/bgp-policy-editor/bgp-policy-editor-backend-preview-selftest.mjs`
- `node tools/bgp-policy-editor/bgp-policy-editor-preview-integration-selftest.mjs`
- `node tools/bgp-navigation-context-bridge-selftest.mjs`
- `node tools/provisioning/provisioning-regression-suite.mjs`
- `git diff --check`
