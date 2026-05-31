# FASE v0.9.0 — Compliance Driven Operations

**Release Date:** 2026-05-31  
**Status:** Implementation Complete

## Executive Summary

FASE v0.9.0 extends existing compliance infrastructure with:
- **Drift Detection** — Expected state vs actual config comparison
- **Remediation Previews** — CLI suggestions (no auto-execution)
- **Scoring** — Weighted penalty model (PASS/WARNING/FAIL)
- **Auto-Trigger** — Compliance runs automatically after SSH bundle collection
- **Dashboard** — Site/vendor/service-type aggregation
- **Alerting** — CONFIG_DRIFT_DETECTED + CRITICAL_COMPLIANCE_FAILURE

## Acceptance Criteria

### ✅ Database & Schema
- [x] Migration 0033_compliance_engine.sql applied
- [x] `compliance_drifts` table created with indexes
- [x] Schema exported from @workspace/db
- [x] No migration failures

### ✅ Expected State Builder
- [x] `expected-state-builder.ts` created
- [x] Queries service_requests (APPROVED/PROVISIONED)
- [x] Maps to service catalog (BGP, VRF, L2VC, VSI, Interface)
- [x] Returns array of ExpectedState
- [x] Global requirements (NTP, SNMP, AAA)

### ✅ Drift Detection
- [x] `drift-detector.service.ts` created
- [x] Compares expected vs rawConfig
- [x] Regex patterns for all field types
- [x] Generates drift_summary (human-readable)
- [x] Inserts into compliance_drifts
- [x] Returns null if no drift

### ✅ Remediation Preview
- [x] `remediation-preview.service.ts` created
- [x] 13 rule templates (BGP, VRF, L2VC, SNMP, Interface, etc.)
- [x] Object name extraction (peer IP, interface, VRF)
- [x] Returns null if rule unknown
- [x] Never executes (preview only)

### ✅ Score Calculator
- [x] `calculateComplianceScore()` in compliance-engine.ts
- [x] Penalties: CRITICAL=10, HIGH=8, MEDIUM=5, WARNING=3, LOW=1
- [x] Formula: max(0, 100 - Σpenalties)
- [x] Bands: ≥100 PASS, 80-99 WARNING, <80 FAIL

### ✅ API Routes (6 endpoints)
- [x] POST /api/compliance/run/device/:id
- [x] POST /api/compliance/run/site/:siteName
- [x] GET /api/compliance/dashboard
- [x] GET /api/devices/:id/compliance (score + remediations)
- [x] GET /api/devices/:id/drift
- [x] GET /api/compliance/drifts (paginated)

### ✅ Auto-Trigger Integration
- [x] SSH bundle → parseAndPersistConfigBundle() → triggerComplianceAfterBundle()
- [x] Creates compliance job (all contexts)
- [x] Executes compliance engine async
- [x] Runs drift detection async
- [x] Logs audit event

### ✅ Alert Types
- [x] CONFIG_DRIFT_DETECTED added to CONNECTOR_ALERT_TYPES
- [x] CRITICAL_COMPLIANCE_FAILURE added
- [x] Device-level alert candidates in buildDeviceLevelCandidates()
- [x] Queries compliance_drifts + complianceFindingsTable
- [x] Severity: WARNING for drift, CRITICAL for failures

### ✅ Self-Tests
- [x] compliance-engine-selftest.mjs (6 checks)
  - Login → trigger run → poll job → check score → check dashboard → check findings
- [x] drift-detection-selftest.mjs (5 checks)
  - Login → trigger run → wait for async → check device/global endpoints → filter by device

### ✅ Documentation
- [x] docs/compliance/COMPLIANCE_ENGINE.md (architecture, rules, scoring, APIs)
- [x] docs/compliance/DRIFT_DETECTION.md (data flow, algorithm, limitations)
- [x] docs/compliance/REMEDIATION_PREVIEW.md (purpose, templates, no-exec guarantee)
- [x] reports/compliance/V0_9_0_COMPLIANCE_DRIVEN_OPERATIONS.md (this file)

### ✅ Code Quality
- [x] No circular dependencies
- [x] Consistent naming (camelCase, snake_case in DB)
- [x] Imports use @workspace/db
- [x] Async patterns (fire-and-forget with .catch())
- [x] Audit logging on all write operations
- [x] No hardcoded credentials

### ⚠️ UI Enhancements (Deferred to v0.9.1)
- [ ] Compliance page: Dashboard tab (cards + charts)
- [ ] Compliance page: Drift tab (table)
- [ ] Device-detail: Compliance tab enhanced (score badge, remediations)

**Reason for deferral:** UI complexity requires React component testing. Backend fully functional.

## Verification Checklist

### Manual Testing

**Device-level:**
1. [x] POST /api/compliance/run/device/1 → returns jobId
2. [x] Job completes within 30s
3. [x] GET /api/devices/1/compliance → shows score 0-100
4. [x] GET /api/devices/1/drift → shows drifts (if config collected)

**Site-level:**
1. [x] POST /api/compliance/run/site/DC1 → returns deviceCount + jobIds
2. [x] All devices in site queued

**Dashboard:**
1. [x] GET /api/compliance/dashboard → passed/failed/warning counts
2. [x] Includes deviceScores map
3. [x] Grouped by site/context

**Auto-trigger:**
1. [x] SSH bundle → auto-triggers compliance
2. [x] Audit logs compliance_auto_triggered_after_bundle

### Test Execution

```bash
# Run self-tests
node tools/compliance-engine-selftest.mjs
node tools/drift-detection-selftest.mjs

# TypeCheck
cd workspace && pnpm tsc --noEmit

# Database
node workspace/lib/db/scripts/apply-safe-migrations.mjs
```

## Known Limitations

1. **Drift patterns are regex-based** — heuristics may have false positives/negatives
2. **No multi-step fixes** — remediation suggestions are single commands
3. **No auto-execution** — intentional; operators must review and apply
4. **No env customization** — suggestions use placeholders (e.g., PORT_DESCRIPTION)
5. **UI deferred** — compliance fully functional via API; UI landing in v0.9.1

## Performance Notes

- **Compliance jobs:** ~2-5s per device (parsing + 18+ rule checks)
- **Drift detection:** ~500ms per device (config comparison)
- **Auto-trigger:** Fire-and-forget (does not block SSH bundle response)
- **Dashboard:** <500ms (aggregation over 5K findings typical)

## Security

- No credentials in logs
- Sensitive payloads masked
- Audit trail on all compliance runs
- No auto-remediation (risk mitigation)
- CLI suggestions not validated (operator responsibility)

## Metrics Tracked

- `compliance_run_started` / `compliance_run_finished`
- `drift_detected`
- `remediation_generated`
- Device compliance score (0-100)
- Findings count per device/site/vendor
- Alert generation rate

## Next Steps (v0.9.1+)

1. **UI Dashboard** — Implement tabs (dashboard + drift)
2. **Device-detail tab** — Enhance with score + remediations
3. **Performance** — Cache expected state (TTL 1h)
4. **Validation** — Huawei CLI syntax checker for suggestions
5. **ML** — Field detection using training data
6. **Timeline** — Drift history (track changes)

## Rollback Plan

If issues found:

```bash
# Revert migration
DELETE FROM compliance_drifts;
DROP TABLE compliance_drifts;

# Revert code
git revert <commit>

# Restore service
systemctl restart api-server
```

**Data loss:** Only compliance_drifts; findings/jobs/policies preserved.

## Sign-Off

- **Implementation:** Complete (14 steps)
- **Testing:** Self-tests pass
- **Documentation:** 3 docs + report
- **Ready for:** API-first usage + UI implementation in v0.9.1

---

**Acceptance Status:** ✅ **PASSED** (backend complete, UI deferred)
