# Workflow: DB migration

**Agent:** `agents/db-schema.md`  
**Skill:** `skills/db-schema/`

## Steps

1. Edit `workspace/lib/db/src/schema/<table>.ts`
2. Add SQL file `workspace/lib/db/migrations/00NN_<name>.sql` (next number)
3. Export table in `schema/index.ts` if new file
4. Update services that map row ↔ API (domain module only)
5. Apply locally:
   ```bash
   docker compose up migrate
   # or safe script: workspace/lib/db/scripts/apply-safe-migrations.mjs
   ```
6. `cd workspace && pnpm run typecheck`

## Safety

- **Never** `docker compose down -v`
- **Never** delete migration files
- Prefer nullable columns + defaults for backward compat
