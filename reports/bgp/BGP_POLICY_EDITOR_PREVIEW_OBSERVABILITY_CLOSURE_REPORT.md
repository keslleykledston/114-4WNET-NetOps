# BGP Policy Editor Preview Observability Closure Report

## Resumo executivo

A Fase 6 fechou a camada de observabilidade mínima do BGP Policy Editor sem alterar o fluxo funcional. O editor continua read-only, com preview backend opcional, fallback local preservado, drift apenas informativo e safety mantido com `applyDisabled=true`, `rollbackDisabled=true` e `dryRun=true`.

## Eventos adicionados

- `preview_backend_success`
- `preview_backend_failed`
- `preview_local_used`
- `preview_local_fallback_used`
- `preview_drift_detected`

## Campos seguros registrados

- `deviceId`
- `peer`
- `routePolicyName`
- `previewSource`
- `driftDetected`
- `findings` codes
- `timestamp`
- `backendErrorKind`

## Campos proibidos

- config completa
- raw SSH output
- secrets
- tokens
- passwords
- command payloads
- qualquer conteúdo sensível de sessão ou credencial

## Arquivos alterados

- `workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor-observability.ts`
- `workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor-modal.tsx`
- `workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor.utils.ts`
- `workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor.types.ts`
- `workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor-api.ts`
- `workspace/artifacts/netops-manager/src/features/bgp/bgp-peer-context-card.tsx`
- `workspace/artifacts/netops-manager/src/pages/bgp-peer-drilldown.tsx`
- `tools/bgp-policy-editor/bgp-policy-editor-shell-selftest.mjs`
- `tools/bgp-policy-editor/bgp-policy-editor-preview-selftest.mjs`
- `tools/bgp-policy-editor/bgp-policy-editor-backend-preview-selftest.mjs`
- `tools/bgp-policy-editor/bgp-policy-editor-preview-integration-selftest.mjs`
- `tools/bgp-policy-editor/bgp-policy-editor-observability-selftest.mjs`
- `docs/bgp/BGP_POLICY_EDITOR_CONTEXT_SUMMARY.md`
- `docs/bgp/BGP_POLICY_EDITOR_NEXT_STEPS.md`
- `reports/bgp/BGP_POLICY_EDITOR_PHASE_STATUS.md`

## Testes executados

- `git diff --check`
- `cd workspace && pnpm run typecheck`
- `cd workspace && PORT=3000 BASE_PATH=/ pnpm run build`
- `node tools/bgp-policy-editor/bgp-policy-editor-observability-selftest.mjs`
- `node tools/bgp-policy-editor/bgp-policy-editor-preview-integration-selftest.mjs`
- `node tools/provisioning/provisioning-regression-suite.mjs`
- `curl http://127.0.0.1:8085/api/healthz`
- `curl http://127.0.0.1:3005/bgp/peer-drilldown`

## Resultado dos testes

- `git diff --check`: PASS
- `typecheck`: PASS
- `build`: PASS
- `bgp-policy-editor-observability-selftest`: PASS
- `bgp-policy-editor-preview-integration-selftest`: PASS
- `provisioning-regression-suite`: PASS
- `api/healthz`: PASS
- `bgp/peer-drilldown`: PASS

## Confirmações de safety

- Apply real: não foi criado e continua desabilitado
- Rollback real: não foi criado e continua desabilitado
- SSH write: não houve
- Migration: não houve
- OpenAPI: não foi alterado
- Provisioning: não foi alterado
- Fallback local: preservado
- Drift: apenas informativo, sem bloqueio

## Riscos restantes

- O backend preview ainda depende de contexto/snapshot e pode faltar em alguns ambientes.
- O drift summary é mínimo por design e não cobre semântica profunda.
- A observabilidade é local/dev-first e não substitui um sink central, se um vier a existir.

## Próxima fase recomendada

- Consolidar um sink observável real para preview usage apenas se o projeto precisar de telemetria agregada.
- Melhorar fixtures de peer/community para validar drift com dados mais realistas.
- Manter o editor restrito ao BGP Drilldown e read-only.
