# Permissions Model (v0.3.0)

## Overview

NetOps Manager v0.3.0 implements a two-layer authorization system:

1. **Role-based (legacy):** Coarse-grained access via `viewer`, `operator`, `admin` roles
2. **Permission-based (new):** Fine-grained, module-level control via `permissionsJson` per user

## Hierarchy

```
Role Defaults ← Effective Permissions if permissionsJson is null
permissionsJson Override ← Effective Permissions if permissionsJson is set
```

Permission checks use `effectivePerms = user.permissionsJson || getDefaultPermissions(user.role)`.

## Modules and Actions

Permission string format: `"module.action"`

| Module | Actions | Purpose |
|--------|---------|---------|
| **devices** | read, write, import, export | Manage devices, topology, configurations |
| **compliance** | read, run, export | View/run compliance checks, export results |
| **scheduler** | read, write | Schedule jobs, manage automations |
| **integrations** | read, write | Connect external systems, manage credentials |
| **users** | read, write | List/create/modify users, manage access |
| **audit** | read | View audit logs, compliance records |

## Role Defaults

### viewer
Minimal, read-only access. No automation, no user management.

| Module | read | write | import | export | run |
|--------|------|-------|--------|--------|-----|
| devices | ✓ | ✗ | ✗ | ✓ | — |
| compliance | ✓ | ✗ | ✗ | ✗ | ✗ |
| scheduler | ✓ | ✗ | — | — | — |
| integrations | ✓ | ✗ | — | — | — |
| users | ✓ | ✗ | — | — | — |
| audit | ✓ | — | — | — | — |

### operator
Full operational access. No user management, integrations read-only.

| Module | read | write | import | export | run |
|--------|------|-------|--------|--------|-----|
| devices | ✓ | ✓ | ✓ | ✓ | — |
| compliance | ✓ | ✓ | ✗ | ✓ | ✓ |
| scheduler | ✓ | ✓ | — | — | — |
| integrations | ✓ | ✗ | — | — | — |
| users | ✓ | ✗ | — | — | — |
| audit | ✓ | — | — | — | — |

### admin
Full access. Complete control.

| Module | read | write | import | export | run |
|--------|------|-------|--------|--------|-----|
| devices | ✓ | ✓ | ✓ | ✓ | — |
| compliance | ✓ | ✓ | ✗ | ✓ | ✓ |
| scheduler | ✓ | ✓ | — | — | — |
| integrations | ✓ | ✓ | — | — | — |
| users | ✓ | ✓ | — | — | — |
| audit | ✓ | — | — | — | — |

## Override Behavior

### Default (No Override)

User with `role = "operator"` and `permissionsJson = null`:
```javascript
// Effective permissions = getDefaultPermissions("operator")
// Has: devices.write, compliance.run, etc.
// Missing: integrations.write, users.write
```

### With Override

User with `role = "operator"` and:
```json
{
  "permissionsJson": {
    "devices": { "read": true, "write": false },
    "compliance": { "read": true, "run": false },
    "scheduler": { "read": true, "write": false },
    "integrations": { "read": false, "write": false },
    "users": { "read": true, "write": false },
    "audit": { "read": true }
  }
}
```

Result: Uses override, not role defaults. Can only **read** (no write, run, etc.).

**Use case:** Restrict operator during incident response or maintenance window.

## Permission Check Logic

```typescript
function checkPermission(user: { role, permissionsJson }, permission: string): boolean {
  const [module, action] = permission.split(".");
  // e.g., "devices.write" → module="devices", action="write"
  
  // Step 1: Use override or role default
  const effectivePerms = user.permissionsJson ?? getDefaultPermissions(user.role);
  
  // Step 2: Lookup module
  const modulePerms = effectivePerms[module];
  if (!modulePerms) return false;
  
  // Step 3: Lookup action
  return modulePerms[action] === true;
}
```

### Example Checks

```typescript
// User: operator, no override
checkPermission(
  { role: "operator", permissionsJson: null },
  "devices.write"
) → true (operator.devices.write = true)

checkPermission(
  { role: "operator", permissionsJson: null },
  "users.write"
) → false (operator.users.write = false)

// User: operator WITH override (read-only)
checkPermission(
  { role: "operator", permissionsJson: { devices: { write: false } } },
  "devices.write"
) → false (override wins)
```

## API Endpoints

### Check Own Permissions

```
GET /api/auth/me/permissions
Response: { effectivePermissions: UserPermissions }
```

Returns merged permissions (permissionsJson if set, else role defaults).

### Middleware Usage

```typescript
// Route protected by permission check
app.post("/api/devices/import", requirePermission("devices.import"), handler);
app.post("/api/users", requirePermission("users.write"), handler);
app.get("/api/audit", requirePermission("audit.read"), handler);
```

## Audit Trail

Permission-based denials are audited:
- Event: `unauthorized_action` or similar
- Payload: { userId, email, permission, resource, timestamp }
- Example: User "john@example.com" (operator, overridden) attempted `users.write` → denied

## Design Principles

1. **Fail Closed:** Missing permission → 403 Forbidden. No defaults, no fallback.
2. **Role Order:** viewer < operator < admin (hierarchy enforced in legacy `requireRole()`).
3. **Backward Compatible:** `permissionsJson = null` uses role defaults. No breaking changes.
4. **Immutable in v0.3.0:** Admins cannot edit `permissionsJson` via UI yet. Set only in DB or admin-only API (future).
5. **Module Expansion:** New modules added by extending `UserPermissions` type and seeding defaults.

## Future Extensibility

### v0.4.0+: Resource-Level Permissions

Extend to device-specific or job-specific access:

```typescript
export type UserPermissions = {
  devices?: {
    read?: boolean | string[];  // true (all) or device IDs
    write?: boolean | string[];
  }
  // ...
}
```

### v0.5.0+: Role Delegation

Allow operator to grant limited permissions to other operators (reversible).

### v0.5.0+: Time-Based Permissions

Permissions expire or activate on schedule (e.g., on-call rotation).

## Security Considerations

### Password Hashing
- Passwords hashed with scrypt (256-bit salt, 64-byte derived key).
- Never exposed in API responses or logs.

### Session Management
- Sessions expire after 30 days (configurable via `SESSION_TTL_MS`).
- Manual revocation possible per session.
- Disabled users cannot login (checked in `findSessionUserByToken()`).

### Audit Integrity
- All admin actions logged (create, update, disable, reset password).
- Audit logs not deletable, only readable.
- Sensitive fields (password_hash, token) redacted in logs.

## Testing

Run selftest to validate permission model:

```bash
node tools/user-management-selftest.mjs
node tools/rbac-selftest.mjs
```

Expected: All permission checks pass, deny rules enforced, no data leakage.

## References

- **Auth Implementation:** `workspace/artifacts/api-server/src/lib/auth.ts`
- **User Routes:** `workspace/artifacts/api-server/src/routes/users.ts`
- **Frontend Usage:** `workspace/artifacts/netops-manager/src/components/auth-provider.tsx`
- **Audit Logging:** `workspace/artifacts/api-server/src/lib/audit.ts`
