---
name: frontend-feature
description: >-
  Build or change netops-manager UI: pages, features, shadcn tables, React Query.
  Use for /l2-circuits, device pages, compliance UI, or component work.
---

# Frontend Feature

**Agent:** `.cursor/agents/frontend-noc.md`  
**Workflow:** `.cursor/workflows/frontend-feature.md`

## Structure

```
pages/<name>.tsx          # route shell
features/<domain>/        # api, types, components
components/ui/            # shadcn (import only)
App.tsx                   # register route
```

## Patterns to copy

| Pattern | Reference |
|---------|-----------|
| NOC table + filters | `features/l2-circuits/`, `pages/l2-circuits.tsx` |
| Detail sheet | `l2-circuit-detail-sheet.tsx` |
| Compact table cells | `l2-circuit-table-cells.tsx` |
| API hooks | `@workspace/api-client-react` or domain `*-api.ts` |

## Guardrails

Read once: `docs/frontend/UX_GUARDRAILS.md`

## Validate

```bash
cd workspace/artifacts/netops-manager && npx tsc --noEmit
docker compose build web && docker compose up -d web
```

## Do not

- Copy 60-bgp_manager UI literally
- Inline 200-line page logic — use features/
