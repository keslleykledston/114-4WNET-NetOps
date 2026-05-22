# Apply and Dry-Run Safety

## Defaults

- `CONFIG_APPLY_ENABLED=false`
- `DRY_RUN_DEFAULT=true`

## Behavior

When `CONFIG_APPLY_ENABLED` is false:

- `POST /api/provisioning-jobs/:id/execute` blocks real execution.
- `POST /api/provisioning-jobs/:id/rollback` blocks real rollback.
- no SSH commands are sent for apply.
- the job is marked with a blocked/skipped outcome.

## Audit

Blocked attempts must be written to audit logs with sanitized metadata.

## Standard Message

`Execução real bloqueada. CONFIG_APPLY_ENABLED=false.`

