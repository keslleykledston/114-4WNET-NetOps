# v0.2.8 Findings Grouping UI Validation Report

**Date:** 2026-05-22  
**Scope:** Frontend grouping UI for compliance findings  
**Branch:** `feature/v0.2.8-findings-grouping-ui`

## Summary

v0.2.8 adds a complete read-only UI for compliance findings grouping. The `/compliance` page now consumes the backend groups endpoint, provides a list/groups view switch, exposes group-focused operational cards, and opens a drawer with affected findings, affected objects, and sanitized per-finding evidence.

## Implemented UI

- `/compliance` consumes `GET /api/compliance-findings-groups` through the generated OpenAPI/Orval client.
- View mode:
  - Findings list.
  - Findings groups.
- Group cards:
  - Top critical groups.
  - Top groups by count.
  - Real blockers.
  - Operational risks.
- Group table:
  - `ruleId`
  - `context`
  - `severity`
  - `operationalCategory`
  - `count`
  - `sampleFindingIds`
  - normalized message.
- Group drawer:
  - Lists findings in the selected group.
  - Shows affected objects.
  - Shows sanitized individual evidence only.

## Filters

- Actionable only.
- Severity.
- Context.
- Operational category.
- Source.
- Confidence.
- Device and status filters preserved.

## Labels

- `BLOCKER_REAL` -> Bloqueador real
- `RISCO_OPERACIONAL` -> Risco operacional
- `PADRONIZACAO` -> Padronização
- `CUSTOMIZACAO` -> Customização
- `INFORMATIVO` -> Informativo
- `FALSO_POSITIVO` -> Falso positivo

## Contract

- OpenAPI updated with `ComplianceFindingGroup`.
- Orval and Zod generated clients updated.
- `ComplianceFinding` and finding group query params include `operationalCategory`.
- Backend `/api/compliance-findings-groups` remains read-only and now returns enriched group fields while preserving `exampleFindingIds`.

## Validation Checklist

- [x] `pnpm -C workspace --filter @workspace/netops-manager typecheck`
- [x] `BASE_PATH=/ PORT=5000 pnpm -C workspace run build`
- [x] `docker compose up -d --build api web`
- [x] `curl http://127.0.0.1:3005`
- [x] API auth smoke: admin login returned authenticated session.
- [x] API grouping smoke: `/api/compliance-findings-groups?severity=medium&context=bgp&operationalCategory=BLOCKER_REAL&source=local_db&confidence=low`
- [ ] Manual browser: login. Not executed in this environment because no browser/Playwright runtime is installed.
- [ ] Manual browser: open `/compliance`. Not executed in this environment because no browser/Playwright runtime is installed.
- [ ] Manual browser: alternate list/groups. Not executed in this environment because no browser/Playwright runtime is installed.
- [ ] Manual browser: open group drawer. Not executed in this environment because no browser/Playwright runtime is installed.
- [ ] Manual browser: severity/context/category/source/confidence filters. Not executed in this environment because no browser/Playwright runtime is installed.
- [ ] Manual browser: actionable only. Not executed in this environment because no browser/Playwright runtime is installed.

## Risk Notes

- Group drawer lists findings already loaded by the current filtered `/api/compliance-findings` response. If the backend list limit is narrower than the group source, the drawer can show fewer local rows than group `count`.
- The grouping endpoint still limits the most recent 500 findings, matching the existing findings endpoint behavior.

## Release Recommendation

Tag recommendation after full validation passes: `v0.2.8`.
