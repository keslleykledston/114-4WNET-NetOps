# Local Auth Setup

## Env

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`
- `SESSION_SECRET`

## Flow

1. set admin env
2. start api/web/db
3. login at `/login`
4. browser receives `netops_session` cookie

## Docker compose

Use host env or `.env`:

```bash
ADMIN_EMAIL=admin@netops.local
ADMIN_PASSWORD=change-me
ADMIN_NAME=Admin
```

## Notes

- no SSO
- no LDAP
- no plaintext password storage
- `viewer` cannot write
- `apply` and `rollback` still blocked by `CONFIG_APPLY_ENABLED=false`

