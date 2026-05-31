---
name: compliance-ops
description: >-
  Compliance policies, jobs, findings engine and /compliance UI. Use for
  compliance checks, exports, stale findings, or policy profiles.
---

# Compliance Operations

**Agent:** `.cursor/agents/compliance.md`  
**Workflow:** `.cursor/workflows/phase-validation.md`

## Bounded paths

| Area | Path |
|------|------|
| Engine | `modules/compliance/` |
| Routes | `src/routes/compliance.ts` |
| UI | `pages/compliance.tsx`, `features/compliance/` |
| Schema | `lib/db/schema/compliance.ts` |

## Doc

`docs/COMPLIANCE_ENGINE_V2.md` (read sections needed only)

## Tests

```bash
node tools/compliance-runtime-smoke.mjs
node tools/compliance-deep-selftest.mjs
```
