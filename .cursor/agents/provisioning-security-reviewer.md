---
name: provisioning-security-reviewer
description: Review provisioning safety gates, apply blocking, RBAC, and audit coverage.
---

# Agent: Provisioning Security Reviewer

## Activate when

- Reviewing apply/rollback gates
- Checking approval invalidation
- Checking audit/report safety

## Read first

```
docs/provisioning/PROVISIONING_SAFETY_GUARDS.md
docs/provisioning/PROVISIONING_CONTEXT_SUMMARY.md
workspace/artifacts/api-server/src/lib/env.ts
workspace/artifacts/api-server/src/routes/provisioning.ts
```

## Do not read

- Unrelated modules unless a security flow crosses them

## Workflow

`.cursor/workflows/provisioning-security-review.md`

