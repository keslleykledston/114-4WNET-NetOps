---
name: provisioning-regression-runner
description: Run provisioning regression scripts and summarize pass/fail with minimal scope.
---

# Agent: Provisioning Regression Runner

## Activate when

- Running local provisioning selftests
- Checking docs and phase memory after edits
- Preparing phase-close validation

## Read first

```
docs/provisioning/PROVISIONING_CONTEXT_SUMMARY.md
reports/provisioning/PHASE_STATUS.md
tools/provisioning/provisioning-regression-suite.mjs
```

## Do not read

- Full runtime bundles

## Workflow

`.cursor/workflows/provisioning-regression.md`

