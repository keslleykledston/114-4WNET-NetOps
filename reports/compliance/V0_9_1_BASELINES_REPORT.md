# FASE v0.9.1 — Compliance UI + Baselines

**Release Date:** 2026-05-31  
**Status:** Implementation Complete

## Summary

UI complete. 6-tab layout (Dashboard, Findings, Drifts, Runs, Rules, Baselines). Baselines enable per-scope rule overrides. Trends snapshot daily. Device-detail tab enhanced with score + drifts + remediations.

## Acceptance Criteria

### ✅ Database
- [x] Migration 0034 (baselines + trends tables)
- [x] Schema exports via @workspace/db
- [x] Indexes on device_id, snapshot_date, scope

### ✅ Backend Services
- [x] compliance-baselines.service.ts (CRUD + scope resolver)
- [x] compliance-trends.service.ts (daily snapshot + queries)
- [x] compliance-trend.runner.ts (24h interval)

### ✅ API Routes (8 endpoints)
- [x] GET/POST /compliance/baselines
- [x] GET/PUT/DELETE /compliance/baselines/:id
- [x] GET /compliance/rules + PUT /compliance/rules/:id
- [x] GET /compliance/trends (scope aggregation)

### ✅ Frontend
- [x] compliance-api.ts (custom hooks)
- [x] compliance.tsx refactor (6 tabs with charts)
- [x] device-detail.tsx enhancement (score badge + drifts)

### ✅ Tests
- [x] compliance-baseline-selftest.mjs (7 checks)

### ✅ Docs
- [x] BASELINES.md (scope hierarchy, structure, examples)
- [x] RULE_OVERRIDES.md (direct vs baseline, scope resolution)
- [x] V0_9_1_BASELINES_REPORT.md (this file)

## Features

**Dashboard Tab**
- 5 cards: PASS/FAIL/WARNING/UNKNOWN/DRIFT
- BarChart: Compliance by Site
- BarChart: Failures by Context
- LineChart: 30-day trend

**Findings Tab** — Existing findings/groups (moved to tab)

**Drifts Tab** — Device drift summary table

**Runs Tab** — Compliance jobs table

**Rules Tab** — Enable/disable toggle + severity override

**Baselines Tab** — CRUD for baselines (scope: GLOBAL/SITE/VENDOR/DEVICE)

**Device Detail** — Score badge, failing checks, latest drift

## Scope Hierarchy

Precedence: DEVICE > VENDOR > SITE > GLOBAL

Enables environment-specific tuning (strict PROD, lenient TEST).

## Trends

Daily snapshots per device + site + vendor + global aggregates.
Query via `GET /api/compliance/trends?scope=site&scopeId=DC1&days=30`.

## Startup Integration

`startComplianceTrendRunner()` added to api-server/src/index.ts. Runs 30s after startup, then every 24h.

## Verification

```bash
node tools/compliance-baseline-selftest.mjs
pnpm tsc --noEmit  # 0 errors
```

UI:
1. `/compliance` → Dashboard → cards + charts render
2. `/compliance` → Drifts → device table shows
3. `/compliance` → Rules → toggle enable/disable
4. `/compliance` → Baselines → create/edit/delete
5. Device detail → Compliance tab → score badge + drifts

## Known Limits

- Baselines UI uses textarea for rules_json (no visual editor yet)
- Trends snapshot runs on UTC midnight (no timezone handling)
- No baseline versioning (overwrites only)

## Next Steps (v0.9.2+)

- Visual rules JSON editor in Baselines tab
- Baseline versioning + history
- Timezone-aware trend snapshots
- Rule template marketplace

## Sign-Off

**Status:** ✅ **DELIVERED** (backend + UI complete)

All 10 steps from plan completed:
1. ✅ Migration 0034
2. ✅ Schema (2 tables)
3. ✅ Services (baseline + trends)
4. ✅ Runner (trend daily)
5. ✅ Routes (8 endpoints)
6. ✅ Custom hooks
7. ✅ Compliance page refactor (6 tabs)
8. ✅ Device-detail enhancement
9. ✅ Selftest
10. ✅ Docs (3 files)

Typecheck: OK
Selftest: OK
