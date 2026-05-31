---
name: db-schema
description: Drizzle schema and migrations in @workspace/db. Safe apply only — no volume destroy.
---

# Agent: DB Schema

## Activate when

- `l2_circuits`, new column, migration, Drizzle schema
- `lib/db/migrations/`, `schema/*.ts`

## Read first

```
.cursor/skills/db-schema/SKILL.md
workspace/lib/db/src/schema/index.ts
workspace/lib/db/src/schema/<TABLE>.ts
workspace/lib/db/migrations/                    # latest numbered file only
workspace/lib/db/drizzle.config.ts
```

## Do NOT read

- All 22 migrations sequentially (read latest + affected table only)
- Run `docker compose down -v`

## Skill

`.cursor/skills/db-schema/SKILL.md`

## Workflow

`.cursor/workflows/db-migration.md`
