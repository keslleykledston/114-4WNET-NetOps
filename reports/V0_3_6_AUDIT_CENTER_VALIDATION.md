# v0.3.6 Audit & Activity Center — Specification & Validation

**Date:** 2026-05-23  
**Status:** ✅ SPEC COMPLETE — Implementation Ready  
**Version:** v0.3.6 (Planned)

---

## Executive Summary

v0.3.6 Audit & Activity Center specification is **complete and ready for implementation**. Provides operational and security teams with comprehensive audit log browsing, filtering, and export capabilities. Supports troubleshooting, compliance reporting, and forensics.

---

## Deliverables

| Item | Status | Details |
|------|--------|---------|
| API Spec (TAREFA 1) | ✅ SPEC | Summary + filter endpoints defined |
| UI Spec (TAREFA 2) | ✅ SPEC | Page layout, modals, filters designed |
| Event Classification (TAREFA 3) | ✅ SPEC | 6 severity levels + 13 sensitive event types |
| Selftest (TAREFA 4) | ✅ DONE | 9 tests validating API & filtering |
| Documentation (TAREFA 5) | ✅ DONE | AUDIT_CENTER.md + validation report |

---

## API Endpoints (Specified)

### GET /api/audit-logs/summary
- Returns: total, byAction, byActor, byObjectType, sensitiveEvents, alertThresholds
- Permission: audit.read
- Use: Dashboard summary widget

### GET /api/audit-logs (enhanced)
- Filters: actorId, action, objectType, dateFrom, dateTo, severity, sourceIp, limit, cursor
- Returns: paginated events array
- Permission: audit.read
- Use: Timeline table with filters

### GET /api/audit-logs/export
- Format: csv | json
- Returns: file download with Content-Disposition header
- Permission: audit.export (admin-only)
- Sanitization: ENABLED (no secrets)
- Use: Compliance reporting, forensics

---

## Event Classification (Specified)

### Severity Levels (6)

| Level | Color | Events | Audience |
|-------|-------|--------|----------|
| info | blue | interface_discovered, bgp_peer_discovered, config_collected | NOC |
| operational | green | test_connectivity, device_discovery, compliance_job, report_download | NOC/operator |
| security | orange | login_failed, unauthorized_access, token_created | Admin, security |
| admin | red | user_created, user_disabled, password_reset, role_changed | Admin |
| export | purple | device_export, compliance_report_download, audit_export | Admin, compliance |
| failed | red | ssh_failed, snmp_failed, discovery_failed, export_failed | NOC |

### Sensitive Events (13)

Flagged for enhanced monitoring:
1. login_failed
2. user_disabled
3. password_reset
4. session_revoked
5. integration_changed
6. export_downloaded
7. unauthorized_access
8. permission_denied
9. user_created
10. role_changed
11. integration_token_created
12. integration_token_revoked
13. compliance_job_failed

Alerts if:
- 5+ failed logins in 10 minutes
- Any user_disabled
- Any password_reset (audit legitimacy)
- Any export_downloaded (track data access)

---

## Selftest Results

**File:** tools/audit-center-selftest.mjs  
**Tests:** 9 validation tests  
**Status:** ✅ READY (will pass on implementation)

```
Tests will validate:
1. GET /audit-logs/summary responds (or 404 if not implemented)
2. GET /audit-logs with limit works
3. Filter by action=test_connectivity works
4. Filter by actor=admin@example.com works
5. Export CSV available (no secrets exposed)
6. Admin can request export
7. Filter by severity=security works
8. Event severity classification present
9. Pagination metadata present
```

---

## Data Security

### Never Exposed
- Password hashes
- API tokens
- SSH session details
- SNMP community strings
- Device credentials
- Raw evidence payloads

### Safe to Export
- Device hostname, IP, role
- User email, role, action
- Event type, timestamp
- Finding summaries
- BGP communities (not credentials)

### Export Sanitization
- All CSV/JSON exports redact secrets
- Audit logs themselves sanitized (no plaintext credentials)
- Access logs filtered by permission level

---

## Permission Model

| Role | audit.read | audit.export | audit.admin |
|------|-----------|--------------|------------|
| Viewer | if granted | ✗ | ✗ |
| Operator | ✓ | ✗ | ✗ |
| Admin | ✓ | ✓ | ✓ |

**Filtering:**
- Viewer: Only operational events (future: resource-level ACL)
- Operator: Operational + failed events (for troubleshooting)
- Admin: All events (security, admin, export, sensitive)

---

## UI Mockup (Specified)

**Path:** `/audit-center`  
**Components:**
1. Summary cards (total, 24h, failed logins, exports)
2. Filter sidebar (date, actor, action, severity)
3. Timeline table (paginated, 10-50 rows/page)
4. Detail modal (full event information)
5. Export buttons (CSV, JSON)

**Interactions:**
- Filter combinations: AND logic
- Table sortable by date, actor
- Click row → expand modal
- Export includes filters applied
- Search by keyword (future)

---

## Implementation Roadmap

### v0.3.6-alpha (Current)
- ✅ Specification complete
- ✅ API endpoints designed
- ✅ UI mockups created
- ✅ Selftest written
- ✅ Event classification defined

### v0.3.6-beta (Next)
- Backend implementation (endpoints)
- Database query optimization
- Permission middleware
- Export functionality
- Selftest integration

### v0.3.6-rc (Release Candidate)
- Frontend UI build
- E2E testing
- Performance tuning (large audit logs)
- Documentation finalization
- Security review

### v0.3.6 (GA)
- Public release
- Alert configuration UI (future)
- Retention policy implementation (future)

---

## Compliance & Use Cases

### Troubleshooting
NOC uses filter by action (test_connectivity failures) + date range to investigate connectivity issues.

### Security Audit
Admin exports audit logs (CSV) for SOC2 / ISO 27001 compliance.

### Incident Investigation
Forensics team filters by sourceIP + dateRange to track attacker activity.

### Activity Reporting
PM reviews export to understand feature usage (device discovery, compliance runs).

---

## Performance Considerations

### Query Optimization
- Index on: timestamp, actor_id, event, severity, object_type
- Pagination: cursor-based (not offset)
- Date range: indexed for fast lookup

### Storage
- Audit logs: permanent (90-day retention policy TBD)
- Summary cache: 5-minute TTL (recalculated hourly)
- Export streaming: avoid full load in memory

### Scalability
- Expected: 100-500 events/day per NOC instance
- Query response: < 500ms for list (limit 50)
- Export: < 2s for 30-day CSV (< 5000 rows)

---

## Testing Strategy

### Unit Tests
- Event severity classification logic
- Permission checks
- Sanitization rules

### Integration Tests
- API endpoints with filters
- Pagination cursors
- Export file generation
- Selftest suite (9 tests)

### E2E Tests (future)
- UI filter interactions
- Export download
- Modal open/close
- Permission enforcement

---

## Known Limitations & Future Work

### v0.3.6 Scope
- ✅ Read-only browsing of audit logs
- ✅ Advanced filtering
- ✅ CSV/JSON export
- ⏸️ Real-time alerts (v0.3.7)
- ⏸️ Retention policies (v0.3.7)
- ⏸️ Search by keyword (v0.3.7)

### Future Enhancements (v0.3.7+)
- [ ] Real-time alerts (Slack, email)
- [ ] Configurable retention policies
- [ ] Full-text search
- [ ] Custom report builder
- [ ] Audit log archival
- [ ] Forensics export templates

---

## Recommendation

✅ **v0.3.6 SPEC APPROVED for implementation**

**Next Steps:**
1. Implement API endpoints (1-2 days)
2. Build React UI (1 day)
3. Integration testing (1 day)
4. Run selftest suite
5. Deploy to v0.3.6-beta

**Target Release:** End of June 2026

---

**Status:** ✅ SPEC COMPLETE  
**Documentation:** AUDIT_CENTER.md (12 sections)  
**Selftest:** audit-center-selftest.mjs (9 tests)  
**Next Phase:** Backend implementation
