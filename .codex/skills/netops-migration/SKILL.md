---
name: netops-migration
description: Use for controlled migration work in 114-4WNET-NetOps from 60-bgp_manager, preserving current shadcn/Tailwind frontend design while porting BGP/SNMP/SSH/Huawei VRP behavior in phases.
---

# NetOps Migration Skill

## Hard rules

- Preserve 114 frontend layout, theme, shadcn/ui, Tailwind tokens and existing routes.
- Treat `../60-bgp_manager` as behavior reference only.
- Do not copy 60 frontend literally.
- Do not copy Python into TypeScript.
- Do not run destructive git/db commands.
- Every code change that affects runtime must be applied to the specific Docker container before final response.
- Never remove DB volumes. Do not use `docker compose down -v`, `docker volume rm`, DB reset, or migration deletion unless user explicitly requests and confirms backup.
- Keep docs and TODOs updated in:
  - `reports/frontend/UX_BASELINE.md`
  - `docs/frontend/UX_GUARDRAILS.md`
  - `reports/migration/60_BGP_MANAGER_FEATURE_MAP.md`
  - `reports/migration/FUTURE_PHASE_TODOS.md`

## Current frontend paths

- App: `workspace/artifacts/netops-manager/src`
- Feature root:
  - `features/netops-tree`
  - `features/device-inventory`
  - `features/bgp`
  - `features/communities`
- Do not use requested `workspace/client` path unless project architecture changes.

## Current backend paths

- API: `workspace/artifacts/api-server/src`
- Future modules should live under:
  - `workspace/artifacts/api-server/src/modules/netops/snmp`
  - `workspace/artifacts/api-server/src/modules/netops/ssh`
  - `workspace/artifacts/api-server/src/modules/netops/huawei-vrp`
  - `workspace/artifacts/api-server/src/modules/netops/bgp`
  - `workspace/artifacts/api-server/src/modules/netops/interfaces`
  - `workspace/artifacts/api-server/src/modules/netops/communities`

## Phase order

1. Freeze design baseline.
2. Update UX guardrails.
3. Map 60 features.
4. Add visual tree with placeholders.
5. Add read-only APIs.
6. Add SNMP/SSH read-only behavior.
7. Replace placeholders with real panels.
8. Validate visual and technical state.

## Validation

Run:

```bash
cd workspace
pnpm run typecheck
BASE_PATH=/ PORT=5000 pnpm run build
```

When Docker changed:

```bash
docker compose config
docker build --pull --no-cache -t netops-manager-ci .
```

## Local helper

Run from repo root:

```bash
tools/netops-audit.sh
tools/apply-containers.sh api web
```
