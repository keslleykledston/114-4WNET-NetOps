# Roadmap v0.3.x Series

## v0.3.0 ✅ COMPLETE

**User Management & Permissões**
- CRUD usuarios (create, list, read, update, delete, disable, enable)
- Password reset com audit
- Session management (list, revoke)
- Permission middleware (requirePermission)
- Role hierarchy: viewer < operator < admin
- Audit logging for all user actions
- Frontend /users page (admin-only)

**Status:** Deployed, 15/15 selftest pass, v0.3.0 tagged

---

## v0.3.1 🚀 IN PROGRESS

**Device Export (Complete)**
- ✅ CSV export (UTF-8, quoted fields)
- ✅ JSON export (with metadata)
- ✅ Permission: devices.export (operator+)
- ✅ Audit logging: device_export
- ✅ Selftest: CSV/JSON export working

**Device Import (Deferred to v0.3.2)**
- 🟡 Parser created (CSV/TXT support)
- 🟡 Validators implemented (IP, hostname, vendor, role)
- 🟡 Deduplication logic written
- ❌ Upload middleware (needs multer)
- ❌ File storage (needs strategy)
- ❌ Apply endpoint (partially written)

**Status:** Export ready to merge. Import on hold for file handling infrastructure.

---

## v0.3.2 📋 PLANNED

**Device Import (Complete)**
- File upload handler (multer + temporary storage)
- CSV/TXT parser + delimiter detection
- XLSX support (add xlsx dependency)
- Preview endpoint: POST /api/devices/import/preview
- Apply endpoint: POST /api/devices/import/apply
- Deduplication: skip or update (non-password fields only)
- Credential protection: passwords never overwritten
- Frontend import modal + device list integration
- Selftest: import CSV, XLSX, duplicate handling

**Estimated scope:**
- Backend: 150 lines (import endpoint + file handling)
- Frontend: 200 lines (import modal + integration)
- Services: (already written, just wire up)

---

## v0.3.3 📋 PLANNED

**Batch Validation**
- Pre-validate device connectivity before import
- SSH/SNMP test during import (optional)
- Results summary: reachable, unreachable, mixed

**Template Download**
- Download template CSV with all supported columns
- Pre-filled vendor/role dropdowns

---

## v0.3.4 📋 PLANNED

**Advanced Import**
- Scheduled imports from URL (e.g., NetBox export)
- Merge strategy: overwrite, merge configs, skip
- Rollback capability (undo import)
- Import history + audit trail per import run

---

## Beyond v0.3.x

**v0.4.0+**
- Multi-factor authentication (MFA, TOTP)
- SSO integration (LDAP/SAML)
- Resource-level ACL (device-specific permissions)
- Email notifications + password reset tokens
- Bulk operations dashboard (import/export batch status)

---

## Current Blockers

1. **v0.3.2 Import:** Need file storage strategy (disk/S3/memory)
2. **v0.3.2 XLSX:** Need xlsx package (add to pnpm)
3. **Frontend:** Need import/export modal components (not yet designed)

---

## Development Velocity

| Version | Feature | Days | Status |
|---------|---------|------|--------|
| v0.3.0 | User Management | 2 | ✅ Complete |
| v0.3.1 | Device Export | 1 | 🚀 Ready (no import) |
| v0.3.2 | Device Import | 3-4 | 📋 Blocked on infra |
| v0.3.3 | Batch Validation | 1-2 | 📋 Planned |
| v0.3.4 | Advanced Import | 2-3 | 📋 Planned |

---

## Testing Strategy

**Per release:**
- ✅ Typecheck + build (no errors)
- ✅ Selftest (15+ validations)
- ✅ Manual smoke test
- ✅ Docker compose up -d (all services healthy)
- ✅ Permission matrix check

**Before tagging:**
- All selftest pass
- No breaking changes
- Audit trail validated
- Documentation updated

---

## Merge & Release Cadence

| Phase | Branch | Action |
|-------|--------|--------|
| Development | main | Feature branch → pull request |
| Review | PR | Selftest pass → approve |
| Merge | main | Merge → tag vX.X.X |
| Deploy | Production | Tag → docker compose build |
| Monitor | Live | 24h watch for errors |

---

## Known Issues & Workarounds

1. **Passwords in CSV export:** Never exported (by design)
   - Workaround: Use separate secure channel for credential updates

2. **Import preview:** File hash not persistent across sessions
   - Workaround (v0.3.2): Store in session or temporary database

3. **Large imports (>1000 rows):** May timeout
   - Workaround: Split into multiple files

---

## Documentation

| Doc | Purpose | Status |
|-----|---------|--------|
| USER_MANAGEMENT.md | Operator guide (v0.3.0) | ✅ Complete |
| PERMISSIONS_MODEL.md | Developer guide (v0.3.0) | ✅ Complete |
| DEVICE_IMPORT_EXPORT.md | Import/export guide (v0.3.1) | ✅ Complete |
| V0_3_0_USER_MANAGEMENT_VALIDATION.md | Validation report | ✅ Complete |
| V0_3_1_EXPORT_STATUS.md | Export feature status | ✅ Complete |

---

## Next Immediate Action

**To merge v0.3.1 export:**

```bash
# 1. Verify all tests pass
node tools/user-management-selftest.mjs      # v0.3.0 validation
node tools/devices-export-selftest.mjs       # v0.3.1 validation

# 2. Build + Docker check
pnpm run build
docker compose up -d --build
curl http://127.0.0.1:8085/api/healthz

# 3. Tag release
git tag v0.3.1
git push origin v0.3.1

# 4. Schedule v0.3.2 work (import + file handling infrastructure)
```

---

**Last updated:** 2026-05-22  
**Next review:** v0.3.2 planning kickoff  
**Owner:** Implementation Team
