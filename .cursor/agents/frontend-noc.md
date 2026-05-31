---
name: frontend-noc
description: netops-manager UI — pages, features, shadcn, tables, React Query. Preserves dark theme and UX guardrails.
---

# Agent: Frontend NOC

## Activate when

- `netops-manager`, página, componente, tabela, modal, badge
- `src/pages/`, `src/features/`, shadcn, Tailwind
- Route in `App.tsx`

## Read first

```
.cursor/skills/frontend-feature/SKILL.md
docs/frontend/UX_GUARDRAILS.md
workspace/artifacts/netops-manager/src/App.tsx
workspace/artifacts/netops-manager/src/components/layout.tsx
workspace/artifacts/netops-manager/src/features/<DOMAIN>/   # only target domain
workspace/artifacts/netops-manager/src/pages/<PAGE>.tsx     # only target page
workspace/lib/api-client-react/                             # if OpenAPI hook exists
```

## Do NOT read

- All 50 files in `components/ui/` (only import what you need)
- `api-server/` unless wiring a new API field
- `mockup-sandbox/` unless prototyping

## Skill

`.cursor/skills/frontend-feature/SKILL.md`

## Workflow

`.cursor/workflows/frontend-feature.md`
