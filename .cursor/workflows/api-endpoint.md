# Workflow: API endpoint

**Agent:** `agents/api-platform.md` (+ domain agent if applicable)  
**Skill:** `skills/api-endpoint/`

## Steps

1. Identify domain module under `src/modules/<name>/`
2. Read existing `*.routes.ts` + `*.controller.ts` + `*.service.ts` in that module only
3. Register router in `src/routes/index.ts` if new top-level file
4. Add gate/pilot check if operational collection
5. Update `workspace/lib/api-spec/openapi.yaml` if frontend uses generated client
6. Regenerate client (if project convention):
   ```bash
   cd workspace/lib/api-spec && pnpm run generate
   ```
7. Validate:
   ```bash
   cd workspace/artifacts/api-server && npx tsc --noEmit
   cd workspace && pnpm run typecheck
   ```
8. Rebuild: `docker compose build api && docker compose up -d api`

## Do not

- Add write SSH commands without `validateReadonlyCommand`
- Skip auth on protected routes
