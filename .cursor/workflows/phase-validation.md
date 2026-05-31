# Workflow: Phase validation

**Agent:** `agents/qa-smoke.md`  
**Skill:** `skills/netops-smoke-validation/`

## Steps

1. Identify domain → list selftests from `docs/ai/TESTING.md` (that domain only)
2. CI parity:
   ```bash
   cd workspace && pnpm install --frozen-lockfile
   pnpm run typecheck && pnpm run build
   ```
3. Run offline selftests:
   ```bash
   node tools/<domain>-selftest.mjs
   ```
4. If runtime required: confirm flags in `.env`, pilot device id, `API_BASE`
5. Run smoke script(s) for phase
6. Summarize: pass/fail, commands, no secrets

## Output template

- Scope: domain + files touched
- Selftests: name + exit code
- Runtime: flags used, device id, sample JSON field
- Blockers: explicit
