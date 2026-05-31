---
name: compliance
description: Compliance engine, policies, jobs, findings export, compliance UI page.
---

# Agent: Compliance

## Activate when

- `compliance`, policy, findings export, stale findings
- `/compliance` page, `compliance_findings`

## Read first

```
.cursor/skills/compliance-ops/SKILL.md
workspace/artifacts/api-server/src/routes/compliance.ts
workspace/artifacts/api-server/src/modules/compliance/
workspace/artifacts/netops-manager/src/pages/compliance.tsx
workspace/artifacts/netops-manager/src/features/compliance/
workspace/lib/db/src/schema/compliance.ts
docs/COMPLIANCE_ENGINE_V2.md
```

## Do NOT read

- L2 parsers unless finding code cross-links VLAN

## Skill

`.cursor/skills/compliance-ops/SKILL.md`

## Workflow

`.cursor/workflows/phase-validation.md`
