# RBAC Model

## Scope

RBAC local, simple, internal.

## Roles

- `viewer`
- `operator`
- `admin`

## Auth

- login local via `POST /api/auth/login`
- session via `netops_session` httpOnly cookie
- token hash stored in `user_sessions`
- password hash stored in `users.password_hash`

## Rules

- `viewer`: read-only
- `operator`: read-only + operational writes
- `admin`: full local control

## Admin seed

- env:
  - `ADMIN_EMAIL`
  - `ADMIN_PASSWORD`
  - `ADMIN_NAME`
- seeding only when `ADMIN_PASSWORD` exists

## Audit

- audit logs store `actor_id`
- API resolves `actor` with user name/email/role when available

