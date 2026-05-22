# v0.2.1 RBAC Validation

## Status

- source typecheck: PASS
- workspace build: PASS
- openapi codegen: PASS
- rbac selftest: PASS
- containers: PASS

## Verified

- local login
- `auth/me`
- viewer 401 on protected write path
- operator write access
- admin write access
- audit actor real
- apply/rollback still blocked with `CONFIG_APPLY_ENABLED=false`

## Commands

- `pnpm -C workspace --filter @workspace/api-server typecheck`
- `pnpm -C workspace --filter @workspace/netops-manager typecheck`
- `BASE_PATH=/ PORT=5000 pnpm -C workspace run build`
- `pnpm -C workspace --filter @workspace/api-spec run codegen`
- `RBAC_TEST_ADMIN_EMAIL=admin@netops.local RBAC_TEST_ADMIN_PASSWORD='Admin123!ChangeMe' node tools/rbac-selftest.mjs`

