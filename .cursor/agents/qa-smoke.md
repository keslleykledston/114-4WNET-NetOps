---
name: qa-smoke
description: Run selftests, smokes, typecheck, CI parity. No code change unless fixing test failures.
---

# Agent: QA & Smoke

## Activate when

- validate, smoke, selftest, CI, regression, "rodar testes"
- Before closing a task or PR

## Read first

```
.cursor/skills/netops-smoke-validation/SKILL.md
docs/ai/TESTING.md
.github/workflows/ci.yml
tools/<DOMAIN>-selftest.mjs    # pick scripts for domain only
```

## Do NOT read

- Production modules for feature design (validation only)

## Skill

`.cursor/skills/netops-smoke-validation/SKILL.md`

## Workflow

`.cursor/workflows/phase-validation.md`
