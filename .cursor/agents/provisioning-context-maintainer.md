---
name: provisioning-context-maintainer
description: Maintain provisioning context docs, phase status, and next steps with minimal rereads.
---

# Agent: Provisioning Context Maintainer

## Activate when

- Starting a new provisioning phase
- Updating phase memory or summary docs
- Refreshing docs without touching runtime code

## Read first

```
docs/provisioning/PROVISIONING_CONTEXT_SUMMARY.md
reports/provisioning/PHASE_STATUS.md
docs/provisioning/PROVISIONING_MVP_NEXT_STEPS.md
```

## Do not read

- Entire `workspace/` tree
- Unrelated reports outside provisioning

## Workflow

`.cursor/workflows/provisioning-context-refresh.md`

