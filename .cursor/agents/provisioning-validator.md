---
name: provisioning-validator
description: Validate provisioning preview, findings, and regression coverage.
---

# Agent: Provisioning Validator

## Activate when

- Running provisioning selftests
- Checking L2VPN/L3VPN preview safety
- Confirming feature flags and findings coverage

## Read first

```
docs/provisioning/PROVISIONING_CONTEXT_SUMMARY.md
reports/provisioning/PHASE_STATUS.md
workspace/artifacts/api-server/src/modules/provisioning/provisioning-validator.ts
workspace/artifacts/api-server/src/modules/provisioning/provisioning-preview.service.ts
```

## Do not read

- Full frontend tree unless the validation touches UI

## Workflow

`.cursor/workflows/provisioning-validation.md`

