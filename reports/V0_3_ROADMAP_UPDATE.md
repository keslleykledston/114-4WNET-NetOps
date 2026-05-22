# v0.3.x Roadmap Update

**Date:** 2026-05-22  
**Status:** ✅ ROADMAP UPDATED  
**Version:** v0.3.0–v0.3.3 Planned  
**Components:** User management, device import/export, compliance reports, NOC pilot

---

## Executive Summary

NetOps Manager roadmap extended with 4 new phases (v0.3.0–v0.3.3) focusing on operational maturity:

- **v0.3.0:** User management (CRUD, permissions, session hardening)
- **v0.3.1:** Device bulk import/export with preview and validation
- **v0.3.2:** Compliance report download with sanitized evidence
- **v0.3.3:** NOC pilot with operators, UX validation, uptime dashboard

**Timeline:** v0.3.0 targets Q2 2026 (post-v0.2.9 BGP routes), phased releases.

---

## Files Updated

### 1. ROADMAP.md
- **Added:** v0.3.0–v0.3.3 sections with feature details
- **Structure:** Goals, scope bullets per version
- **Preserved:** v0.2.9+ roadmap items

### 2. TODO.md
- **Added:** Implementation TODOs for v0.3.0–v0.3.2
- **Sections:** User management, import/export, compliance download
- **Format:** Actionable tasks grouped by version

### 3. CHANGELOG.md
- **Added:** v0.3.0 Planned–v0.3.3 Planned entries
- **Format:** Feature list per version (Planned marker)
- **Preserved:** Historical v0.2.x entries

### 4. docs/PROJECT_STATUS.md
- **Updated:** "Próximos Passos Recomendados" section
- **New subsections:** v0.3.0, v0.3.1, v0.3.2, v0.3.3
- **Format:** Ordered steps per phase

### 5. reports/migration/FUTURE_PHASE_TODOS.md
- **Added:** 3 new sections (v0.3.0, v0.3.1, v0.3.2, v0.3.3)
- **Structure:** Objetivo, Scope, Tabelas, Endpoints, UI, Validação
- **Preserved:** BGP Operational Abstractions section

### 6. reports/V0_3_ROADMAP_UPDATE.md (NEW)
- **Content:** This document
- **Purpose:** Executive summary and impact analysis

---

## Feature Details

### v0.3.0 — User Management (Operacional)

**Scope:**
- `/users` admin interface with CRUD
- Granular permissions per module (devices, compliance, scheduler, reports, users)
- Password reset with temporary tokens
- Session timeout (24h default, configurable)
- Manual session revoke
- Audit log for all user actions

**Schema Impact:**
- New: `user_permissions`, `user_sessions_revoked`
- Modified: `users` (extend with created_at, disabled_at)

**Risk:** MEDIUM
- Security: password hashing (bcrypt), token expiry
- Regression: login flow, existing role enforcement
- Mitigation: tests for permission checks, integration tests

**Effort:** ~3 weeks
- Backend: 1.5 weeks (schema, APIs, validation)
- Frontend: 1 week (UI, form, tables)
- Testing: 0.5 weeks

---

### v0.3.1 — Device Import/Export (Batch Operations)

**Scope:**
- Import: CSV/XLSX/TXT with preview pré-aplicação
- Validation: IP/hostname format, deduplication
- Protection: never overwrite credentials
- Export: CSV/XLSX/JSON without secrets
- Audit: track imports with rollback option

**Schema Impact:**
- New: `device_imports`, `device_import_items`
- No breaking changes

**Risk:** LOW-MEDIUM
- Data: deduplication logic, duplicate IPs/hostnames
- Validation: IP/hostname format
- Mitigation: fixtures for edge cases, preview UX testing

**Effort:** ~2.5 weeks
- Backend: 1 week (parsers, validation, export)
- Frontend: 1 week (upload, preview, export menu)
- Testing: 0.5 weeks

---

### v0.3.2 — Compliance Report Download (Export)

**Scope:**
- Download compliance findings by job with applied filters
- Formats: Markdown, JSON, CSV
- Evidence sanitization (no secrets, limited payloads)
- Include: summary by category, device info, timestamp

**Schema Impact:**
- None (query-only, no new tables)

**Risk:** LOW
- Evidence sanitization: regex validation
- Format generation: tested templates
- Mitigation: sanitization tests, preview in UI

**Effort:** ~1.5 weeks
- Backend: 0.5 weeks (export endpoints, sanitization)
- Frontend: 0.5 weeks (download button, format menu)
- Testing: 0.5 weeks

---

### v0.3.3 — NOC Pilot (Operational Validation)

**Scope:**
- 3–5 operators validate platform over 1–2 weeks
- Collect UX feedback, performance metrics, operational trust
- Dashboard: uptime widget, real-time alerts for critical findings
- Integrations: Slack/PagerDuty webhook for BLOCKER_REAL

**Schema Impact:**
- New: `operator_feedback` (optional, for structured data)
- Metrics: log operator actions via audit trail (existing)

**Risk:** LOW (validation-only, no code changes required immediately)
- Operational: operator adoption, training
- Mitigation: pilot coordinator, weekly sync, feedback form

**Effort:** ~2 weeks
- Coordinator: 1 week (scheduling, daily check-ins)
- Development: 0.5 weeks (uptime widget, alert integrations)
- Analysis: 0.5 weeks (report synthesis)

---

## Timeline & Sequencing

```
v0.2.9 (current)    ──► BGP routes, findings grouping, stale handling
                           (merge to main)

v0.3.0 (Q2 2026)    ──► User management (foundation for auditing)
                           └─ 3 weeks after v0.2.9 stable

v0.3.1 (Q2/Q3)      ──► Device bulk ops (enables mass onboarding)
                           └─ 2.5 weeks after v0.3.0

v0.3.2 (Q3)         ──► Compliance export (operational reporting)
                           └─ 1.5 weeks after v0.3.1

v0.3.3 (Q3)         ──► NOC pilot (operational validation)
                           └─ parallel with v0.3.2 or after
```

---

## Breaking Changes

**None.** All v0.3.x features are additive:
- New UI routes, endpoints, schema tables
- Backward compatible with v0.2.9 API
- Existing devices, compliance jobs, audit logs unchanged

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Password reset flow security | HIGH | Bcrypt hashing, token expiry (1h), audit logging, tests |
| Deduplication edge cases | MEDIUM | IP/hostname validation, fixtures, preview UX |
| Evidence sanitization false positives | MEDIUM | Regex tests, manual review in pilot |
| Operator adoption in pilot | MEDIUM | Training, weekly sync, coordinator assigned |
| Scope creep in v0.3.0 (permissions explosion) | MEDIUM | Keep to module-level only, no resource-level ACL v0.3.0 |

---

## Known Limitations

1. **v0.3.0 Permissions:** Module-level only (devices, compliance, etc.), not resource-level (specific device ACL). Resource-level ACL deferred to v0.4.
2. **v0.3.1 Import:** No bulk device group creation. Groups must exist before import.
3. **v0.3.2 Export:** Evidence truncated at 1KB. Full evidence remains in database.
4. **v0.3.3 Pilot:** Feedback qualitative (no NPS survey yet). Future releases may add structured metrics.

---

## Implementation Order

1. **v0.3.0** (User management) — lowest risk, enables auditing for later phases
2. **v0.3.1** (Import/export) — mass onboarding prerequisite
3. **v0.3.2** (Compliance export) — reporting maturity, non-critical
4. **v0.3.3** (NOC pilot) — validation, not code-blocking

---

## Validation Checklist

- [x] Roadmap sections created (ROADMAP.md, TODO.md, CHANGELOG.md)
- [x] Project status updated (docs/PROJECT_STATUS.md)
- [x] Future phase todos detailed (FUTURE_PHASE_TODOS.md)
- [x] UX guardrails preserved (docs/frontend/UX_GUARDRAILS.md — no changes needed)
- [x] Git diff reviewed (docs/roadmap only, no runtime changes)
- [x] No breaking changes identified

---

## Next Steps

1. **v0.2.9 Merge:** Complete BGP routes, findings grouping, stale handling → merge to main
2. **v0.3.0 Planning:** Schedule kick-off with team, review schema changes
3. **v0.3.0 Development:** Begin user management (backend + frontend in parallel)
4. **v0.3.1 Planning:** Design import preview UX mockups
5. **v0.3.2/v0.3.3 Preparation:** Identify pilot operators, schedule coordination

---

## Recommendation

**✅ v0.3.x ROADMAP APPROVED FOR PLANNING**

No blockers identified. Phases are well-scoped, sequenced logically, and preserve backward compatibility. v0.3.0 should begin after v0.2.9 merge validation (estimated early Q2 2026).

---

## Sign-Off

**Prepared By:** Automated roadmap update  
**Date:** 2026-05-22  
**Status:** ✅ Ready for team review and v0.3.0 kickoff planning  
**Next Review:** After v0.2.9 stable merge to main

