# Workflow: Frontend feature

**Agent:** `agents/frontend-noc.md`  
**Skill:** `skills/frontend-feature/`

## Steps

1. Identify route in `src/App.tsx` and target `pages/*.tsx`
2. Create or extend `src/features/<domain>/` (API, types, components)
3. Reuse shadcn from `src/components/ui/` — do not fork primitives
4. Match patterns from sibling feature (e.g. `l2-circuits` for NOC tables)
5. If new API field: confirm backend + optional OpenAPI codegen first
6. Validate:
   ```bash
   cd workspace/artifacts/netops-manager && npx tsc --noEmit
   ```
7. Rebuild: `docker compose build web && docker compose up -d web`
8. Hard refresh browser

## UX checks

- [ ] `docs/frontend/UX_GUARDRAILS.md` respected
- [ ] Dark theme, badge colors match domain
- [ ] Mobile: card list + desktop table if NOC list page
