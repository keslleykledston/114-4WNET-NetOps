# User Management (v0.3.0)

## Overview

NetOps Manager v0.3.0 introduces comprehensive user management with CRUD operations, password resets, session management, and granular permissions.

## Accessing User Management

Navigate to **Administration > Users** in the sidebar (admin-only).

## Creating Users

1. Click **Create User** button
2. Fill in:
   - **Name**: Display name (required)
   - **Email**: Unique email (required)
   - **Password**: Minimum 8 characters (required)
   - **Role**: viewer, operator, or admin (default: viewer)
3. Click **Create**

## User Roles

| Role | Devices | Compliance | Scheduler | Users | Integrations |
|------|---------|-----------|-----------|-------|--------------|
| **viewer** | Read-only | Read-only | Read-only | Read-only | Read-only |
| **operator** | Full access | Full access | Full access | Read-only | Read-only |
| **admin** | Full access | Full access | Full access | Full access | Full access |

## User Actions

### Edit User

1. Click **Edit** button on user row
2. Modify name or role
3. Click **Update**

### Disable User

1. Click **Lock** icon on user row
2. Confirm in dialog
3. User cannot login until re-enabled

### Enable User

1. Click **Unlock** icon on disabled user
2. Confirm dialog
3. User can login again

### Reset Password

1. Click **Reset** (rotation icon) on user row
2. Enter new password (min 8 chars)
3. Confirm
4. User must login with new password on next attempt

### Delete User

1. Click **Delete** (trash icon) on user row
2. Confirm permanently
3. User and all sessions deleted

## Session Management

View and revoke your active sessions:

1. Navigate to your profile (under username in sidebar)
2. Click **Sessions**
3. See all active sessions with expiry times
4. Click **Revoke** to end a session immediately

## Password Security

- Passwords hashed with scrypt (secure one-way hash)
- Never exposed in API responses
- Password resets audited and logged
- Minimum 8 characters required

## Audit Trail

All user management actions are logged:
- User creation (email, role)
- User updates (modified fields)
- Password resets (user affected)
- Session revocation
- Enable/disable actions

View audit logs in **Audit** page → filter by `user_*` actions.

## Best Practices

1. **Least Privilege**: Assign lowest required role
2. **Regular Audits**: Review user list and audit logs weekly
3. **Password Resets**: Use for onboarding; users must change on first login (future)
4. **Disabled vs. Deleted**: Disable inactive users (reversible), delete only when confirmed obsolete
5. **Session Revocation**: Revoke sessions for compromised or terminated accounts

## Future Roadmap

- **v0.3.1**: Email-based password reset with temporary tokens
- **v0.4.0**: Multi-factor authentication (MFA)
- **v0.4.0**: Resource-level permissions (specific device access)
- **v0.5.0**: SSO integration (LDAP/SAML)
