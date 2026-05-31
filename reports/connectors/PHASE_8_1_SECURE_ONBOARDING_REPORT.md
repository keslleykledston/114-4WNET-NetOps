# Phase 8.1 Implementation Report — Secure Connector Onboarding

**Date:** 2026-05-31  
**Status:** ✅ Complete  
**Owner:** NetOps Engineering  

---

## Executive Summary

**Phase 8.1** implements a **one-shot, time-limited token delivery system** for connector onboarding, eliminating the exposure risk of raw tokens in API responses. Tokens are now generated on-demand, delivered via a dedicated admin-only endpoint, and expire within 15 minutes.

### Key Improvements
- ✅ No raw `connector_token` in JSON responses
- ✅ Token delivery audited and logged
- ✅ 15-minute TTL by default
- ✅ One-shot delivery per issuance
- ✅ Zero changes to Python agent
- ✅ Backward compatible with active connectors

---

## Implementation Summary

### Database Changes

| File | Change | Impact |
|------|--------|--------|
| `0028_connector_bootstrap_tokens.sql` | New table + ALTER connectors | Migration creates bootstrap token storage |
| `connectors.ts` (schema) | `connectorTokenHash` nullable | Allows PENDING state without token |

**Migration 0028:**
- `connector_bootstrap_tokens` table: id, connector_id, token_hash, expires_at, used_at, delivered_at, created_by, revoked_at
- `connectors.connector_token_hash` made nullable
- Indices on connector_id, token_hash (unique), expires_at

### API Service Changes

| File | Function | Change |
|------|----------|--------|
| `connectors.types.ts` | `ConnectorCreateResponse` | Removed `connector_token`, added `bootstrap_pending: boolean` |
| `connectors.service.ts` | `buildWireGuardKeys()` | Extracted WireGuard generation (no token) |
| `connectors.service.ts` | `createConnector()` | Sets `connectorTokenHash = null`, returns without token |
| `connectors.service.ts` | `reprovisionConnector()` | Same as createConnector, revokes old bootstrap tokens |
| `connectors.service.ts` | `generateBootstrapPackage()` | NEW — generates token, hash, .env, audit |
| `connectors.service.ts` | `processHeartbeat()` | Marks bootstrap token `used_at` after success |
| `connectors.routes.ts` | `POST /connectors` | Removed `token_preview` from audit metadata |
| `connectors.routes.ts` | `POST /connectors/:id/bootstrap-package` | NEW — admin-only, returns .env download |

### Frontend Changes

| File | Change |
|------|--------|
| `connectors-api.ts` | Removed `connector_token` from `ConnectorCreateResult` type |
| `connectors-api.ts` | NEW `downloadBootstrapPackage()` function |
| `connectors.tsx` | Replaced `createdToken` with `createdConnector` + `bootstrapDownloaded` state |
| `connectors.tsx` | UI: "PENDING BOOTSTRAP" card with download button |
| `connectors.tsx` | Post-download: green checkmark confirmation card |

### Testing

| File | Change | Coverage |
|------|--------|----------|
| `connectors-release-smoke.mjs` | Updated flow: create → bootstrap → heartbeat | Integration test of new flow |
| `connectors-secure-onboarding-selftest.mjs` | NEW unit tests | Token generation, hashing, TTL, expiry, leakage prevention |

### Documentation

| File | Status | Scope |
|------|--------|-------|
| `docs/connectors/SECURE_ONBOARDING.md` | NEW | Full workflow, API reference, security considerations, troubleshooting |
| `docs/connectors/DEPLOY_PRODUCTION.md` | Updated | Added Phase 8.1 deployment notes and migration guide |
| `reports/connectors/PHASE_8_1_SECURE_ONBOARDING_REPORT.md` | This file | Implementation summary |

---

## Acceptance Criteria

### ✅ All criteria met

| Criterion | Status | Evidence |
|-----------|--------|----------|
| No endpoint returns `connector_token` in common JSON | ✅ | `ConnectorCreateResponse` and list responses don't include token |
| Bootstrap is one-shot, audited, expires | ✅ | Endpoint checks active bootstrap, audit logged, 15-min TTL |
| Agent can activate connector | ✅ | Smoke test: createConnector → bootstrap → heartbeat → ONLINE |
| Smoke and secrets leak tests pass | ✅ | `connectors-release-smoke.mjs` updated, selftest all green |
| Fluxo legado deprecated ou removido | ✅ | Old `buildConnectorCredentials()` removed, new flow enforced |

---

## Backward Compatibility

### Active Connectors (already deployed)
- ✅ Existing `connector_token_hash` values remain valid
- ✅ No changes to heartbeat auth mechanism
- ✅ Agent continues to read `CONNECTOR_TOKEN` from env (no change)
- ✅ Python agent code unchanged

### New Connectors
- ❌ Cannot use old `POST /connectors` → grab token flow
- ✅ Must use `POST /connectors/:id/bootstrap-package` (admin-only)
- ✅ Admin UI guides users to new flow automatically

---

## Security Review

### Token Lifecycle
1. **Not generated at creation time** — only on `bootstrap-package` request
2. **Never persisted in plaintext** — only SHA-256 hash in `connector_bootstrap_tokens.token_hash`
3. **TTL enforced** — `expires_at` check on auth
4. **One-shot delivery** — `deliveredAt` and `usedAt` tracked
5. **Revokable** — `revokedAt` set on rotate or explicit revoke
6. **Audit logged** — action = `connector_bootstrap_issued`, actor_id, source_ip recorded

### Token Storage
- **Database:** Hash only (SHA-256 hex)
- **Audit log:** Masked (nc_XXXX…ZZZZ)
- **API response:** Never included
- **User device:** In downloaded `.env` file (user responsibility)

### TTL Rationale
- **15 minutes:** Enough to deploy agent, short enough to minimize exposure window
- **Non-configurable:** Prevents operator from creating long-lived tokens
- **Enforced server-side:** Client cannot override expiry

---

## Testing Results

### Unit Tests (`connectors-secure-onboarding-selftest.mjs`)
```
✓ Token generation and hashing works correctly
✓ Token uniqueness and hash uniqueness confirmed
✓ TTL validation logic works correctly
✓ Token used_at tracking works correctly
✓ Token revocation logic works correctly
✓ .env format is valid
✓ Token does not leak in API responses
```

### Integration Tests (`connectors-release-smoke.mjs`)
```
✓ createConnector returns no token
✓ createConnector has bootstrap_pending=true
✓ bootstrapPackage endpoint accessible (admin)
✓ Token extracted from .env works for heartbeat
✓ Heartbeat succeeds and marks token as used
```

---

## Deployment Checklist

- [x] Database migration 0028 created
- [x] API service updated (createConnector, generateBootstrapPackage, routes)
- [x] Frontend types and components updated
- [x] Smoke test updated
- [x] Selftest created and all passing
- [x] Documentation written (SECURE_ONBOARDING.md, updated DEPLOY_PRODUCTION.md)
- [x] Audit trail for bootstrap issuance
- [x] No raw token in any response or list
- [x] Python agent requires NO changes
- [x] Backward compatible with active connectors

---

## Known Limitations & Future Work

### Current Scope (Phase 8.1)
- One-shot token per issuance (rotate to re-issue)
- Fixed 15-minute TTL (not configurable)
- Bootstrap tokens not queryable by user (admin-only generation)

### Potential Enhancements (Future)
- [ ] Configurable TTL per connector
- [ ] Token preview in list (hash only, no plaintext)
- [ ] User-initiated bootstrap request (currently admin-only)
- [ ] Secondary authentication for bootstrap (e.g., MFA)

---

## Operations Notes

### Monitoring
- Watch audit logs for `connector_bootstrap_issued`
- Alert if same connector requests bootstrap 3+ times per hour (possible attack/mistake)

### Troubleshooting
- **"Active bootstrap token already exists"** → Admin must rotate with `?rotate=true`
- **Heartbeat fails after 15 min** → Token expired, rotate to issue new
- **Token leaked** → Rotate immediately; old hash still valid for active agents

### Runbooks
1. **Onboard new connector:** Admin UI → create → download bootstrap → deploy agent
2. **Rotate token:** `POST /connectors/:id/bootstrap-package?rotate=true`
3. **Audit trail:** Query `audit_logs` table for `action = 'connector_bootstrap_issued'`

---

## Metrics & Observability

### Audit Events
```
action: "connector_bootstrap_issued"
actor_id: <user_id>
object_id: <connector_id>
source_ip: <ip>
```

### No metrics added (audit log sufficient)

---

## Sign-off

- **Implementation:** ✅ Complete
- **Testing:** ✅ All passing
- **Documentation:** ✅ Complete
- **Backward compatibility:** ✅ Verified
- **Security review:** ✅ Passed

**Ready for production deployment.**
