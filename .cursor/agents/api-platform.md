---
name: api-platform
description: Express API routes, controllers, services, auth, env gates. Use when adding endpoints or cross-cutting API behavior.
---

# Agent: API Platform

## Activate when

- New route, controller, middleware, auth, permission
- `src/routes/`, module registration in `routes/index.ts`
- Not parser-specific (use domain agent instead)

## Read first

```
.cursor/skills/api-endpoint/SKILL.md
workspace/artifacts/api-server/src/routes/index.ts
workspace/artifacts/api-server/src/lib/env.ts
workspace/artifacts/api-server/src/lib/auth.ts
workspace/artifacts/api-server/src/modules/<TARGET>/   # one module only
workspace/lib/api-spec/openapi.yaml                    # if contract change
```

## Do NOT read

- Unrelated `modules/*` (load domain agent)
- Full `dist/` bundle

## Skill

`.cursor/skills/api-endpoint/SKILL.md`

## Workflow

`.cursor/workflows/api-endpoint.md`
