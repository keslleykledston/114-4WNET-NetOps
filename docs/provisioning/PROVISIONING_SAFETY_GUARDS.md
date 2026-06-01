# Provisioning Safety Guards

## Baseline

Provisioning in this repository is read-only by default. The MVP extends preview and approval flows but keeps real apply and rollback guarded.

## Mandatory guards

- Apply is blocked unless `PROVISIONING_APPLY_ENABLED=true`
- Rollback is blocked unless `PROVISIONING_ROLLBACK_ENABLED=true`
- Approval is required when `PROVISIONING_REQUIRE_APPROVAL=true`
- Dry-run mode is the default when `PROVISIONING_DRY_RUN_DEFAULT=true`
- Preview remains enabled when `PROVISIONING_PREVIEW_ENABLED=true`

Legacy flags remain available for compatibility:

- `PROVISIONING_EXECUTE_ENABLED`
- `CONFIG_APPLY_ENABLED`

## Command safety

Commands must come from registered templates only. The engine must reject or never generate:

- `reset`
- `reboot`
- `delete`
- `format`
- broad `undo`
- free-form `system-view`
- free-form `commit`
- save operations without an explicit workflow gate

## Approval safety

- A preview must exist before approval
- Approval must be recorded in the job
- Approval becomes invalid if parameters change after approval
- Apply must stop if the approval is missing or stale

## Audit safety

The following actions must always be logged:

- `provisioning_request_created`
- `provisioning_precheck_started`
- `provisioning_precheck_finished`
- `provisioning_preview_generated`
- `provisioning_approved`
- `provisioning_apply_blocked`
- `provisioning_report_generated`

No secrets, passwords, communities, or tokens may appear in audit payloads, reports, or docs.

## RBAC safety

Provisioning approval and apply actions must respect the existing RBAC model. The new flow must not bypass the current `provisioning.read` / `provisioning.write` expectations.

## Current risk

The main current risk is runtime parity: code and docs are in place, but container rebuild validation depends on the workspace lockfile being aligned with the build environment.

