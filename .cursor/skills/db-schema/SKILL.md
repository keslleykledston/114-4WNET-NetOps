---
name: db-schema
description: >-
  Drizzle schema and SQL migrations in @workspace/db. Use when adding columns,
  tables, or migration files for NetOps Postgres.
---

# DB Schema

**Agent:** `.cursor/agents/db-schema.md`  
**Workflow:** `.cursor/workflows/db-migration.md`

## Paths

| Item | Path |
|------|------|
| Schema | `workspace/lib/db/src/schema/` |
| Migrations | `workspace/lib/db/migrations/00NN_*.sql` |
| Config | `workspace/lib/db/drizzle.config.ts` |

## Process

1. Edit schema TS
2. Add numbered SQL migration
3. Update **one** domain service mapping rows
4. `docker compose up migrate` (no volume delete)

## JSON columns

`evidence_flags`, `findings` — keep backward compatible shapes

## Forbidden

`docker compose down -v`
