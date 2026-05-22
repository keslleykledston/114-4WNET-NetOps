# v0.2.7+ BGP Prefix Routes & Post-RC Hardening Validation Report

**Date:** 2026-05-22  
**Status:** ✅ FEATURE COMPLETE  
**Version:** v0.2.7+  
**Components:** BGP prefix routes (SSH real-time), operational category normalization, findings grouping

---

## Executive Summary

NetOps Manager v0.2.7+ extends v0.2.6-rc1 with real-time BGP prefix route queries via SSH and hardening of compliance findings classification. The BGP prefix routes feature enables operators to inspect received/advertised routes for any peer with pagination protection and excess volume warnings. Compliance findings have been normalized and enriched with findings grouping for analytics.

**Key Metrics:**
- ✅ BGP prefix routes query: fully implemented + tested
- ✅ Route parser: dual Huawei VRP format support (IPv4/IPv6, VRF)
- ✅ Frontend modal: paginates 200 routes/page, AS-PATH badges, excess warnings
- ✅ SSH integration: keyboard-interactive auth, 60s timeout, read-only whitelist
- ✅ Findings grouping: 13 distinct groups by severity + context + category + policy
- ✅ Category normalization: all 6 operational categories standardized (no POSSIVEL_FALSO_POSITIVO)
- ✅ Route history persistence: query_duration_ms, query_executed_at with indices

---

## Feature: BGP Prefix Routes (SSH Real-Time)

### Backend Implementation

**Parser:** `routes-parser.ts`
- Dual format support: Network/PrefixLen/Path-Ogn (IPv6) + classic advertised table
- Extracts total count from device output  
- Returns `{ prefix, asPath, origin }`
- Normalizes AS-PATH: strips spacing, removes trailing 'i', validates CIDR

**Service:** `bgp-routes.service.ts`
- `buildRouteCommands()`: constructs Huawei VRP commands per direction/VRF
  - IPv4/IPv6: `display bgp [ipv6] routing-table [vpnv4/vpnv6 vpn-instance VRF] peer IP [received|advertised]-routes`
  - Fallback chain: vpnv4 → routing-table vpn-instance → global
- `executeSSHCommands()`: keyboard-interactive auth, validates read-only, 60s timeout
- `queryBgpRoutes()`: main handler
  - Validates direction vs peer role (client=received, provider/ix/cdn=advertised)
  - Caps display at 200 routes max
  - Warns if routeCounters > 5000
  - Paginates with offset/limit
  - Persists to bgpRouteHistory with query_duration_ms

**Request/Response Contract:**
```typescript
RouteQueryRequest { direction: "received"|"advertised", limit?: 200, offset?: 0, page?: 1 }
RouteQueryResponse {
  peerIp, peerName, direction, total, page, limit, hasNextPage, hasPreviousPage,
  excessWarning, warningMessage, items: [{ prefix, asPath[], origin, confidence, evidence }]
}
```

**Endpoint:** `POST /api/devices/:id/bgp/peers/:peerIp/routes/query`
- Audited: logs action, routesReturned, totalRoutes
- Safe: no full dump, caps 200, validates whitelist

### Frontend Implementation

**Modal:** `bgp-peer-routes-modal.tsx`
- Header: title with peer name, subtitle with IP + role
- Counter: "Total de prefixos recebidos/anunciados: X"
- Excess warning: amber alert + message (volume, SSH timeout context)
- Routes table: prefix (mono font), AS-PATH type, ASN badges (compact, colored)
- Pagination: Previous/Next buttons, range display (1–200 de 5000), load skeletons
- Empty state: "Nenhum prefixo encontrado"

**Integration:** `bgp-panel.tsx`
- Buttons: Details (Info icon) + Prefixes (Download icon)
- Smart labeling: client → "Prefixos recebidos", provider/ix/cdn → "Prefixos advertidos"
- Role-based direction: button selection automatic

**Hook:** `useDiscoveryBgpPeerRoutes`
- Query key: ["device-discovery-bgp-peer-routes", deviceId, peerIp, direction, page, limit]
- Enabled gate: only when modal open + peer valid
- Fetch: POST to /api/devices/{id}/bgp/peers/{ip}/routes/query

### Testing

**Selftest:** `bgp-prefix-routes-selftest.mjs`
- ✅ Parser: fixture with 3 routes, extracts reportedTotal, validates asPath
- ✅ Commands: IPv4/IPv6, VRF fallbacks, received/advertised
- ✅ Service: limit capping (request 500 → 200), pagination (page 2 on 3 total = 1 item)
- ✅ Warnings: routeCounters.receivedRoutes > 5000 sets excessWarning + message
- ✅ Persistence: 2 queries → 2 rows in bgpRouteHistory table
- **Result:** PASSED ✅

**Manual Validation:**
- Device 1, Peer 10.20.0.13, client role
- SSH executed successfully
- Returned routes with AS-PATH parsed into array
- Response in ~2.5s
- Pagination: page 1 shows routes 1–200, page 2 disabled if hasNextPage=false

---

## Feature: Compliance Findings Normalization & Grouping

### Database Normalization

**Migration:** `0009_compliance_job_profile.sql` + manual update

**Changes:**
- Operationalcategory column: 6 categories (BLOCKER_REAL, RISCO_OPERACIONAL, PADRONIZACAO, CUSTOMIZACAO, INFORMATIVO, FALSO_POSITIVO)
- Standardized: all POSSIVEL_FALSO_POSITIVO → FALSO_POSITIVO (16 findings updated)
- All 500 findings in device 1 have operationalCategory set (100%)
- policyProfileName: all 16 jobs reference one of 3 profiles

### Findings Grouping Endpoint

**Endpoint:** `GET /api/compliance-findings-groups`

**Response Structure:**
```json
{
  "groups": [
    { severity: "critical", context: "bgp", operationalCategory: "BLOCKER_REAL", policyName: "huawei-vrp-edge-balanced", count: 10, exampleFindingIds: [1, 2, 3...] },
    ...
  ],
  "summary": { totalGroups: 13, totalFindings: 500, categoriesInUse: ["BLOCKER_REAL", "RISCO_OPERACIONAL", ...] }
}
```

**Implementation:**
- Queries 500 findings with job/device joins
- Groups by severity, context, operationalCategory, policyProfileName
- Returns count + 5 example IDs per group
- Memory efficient: single pass aggregation

**Test Result:**
- 13 groups returned
- Categories in use: 5 (BLOCKER_REAL, FALSO_POSITIVO, INFORMATIVO, PADRONIZACAO, RISCO_OPERACIONAL)
- No POSSIVEL_FALSO_POSITIVO in result ✅

### Route History Persistence

**Migration:** `0010_bgp_route_query_logging.sql`

**Schema Enhancements:**
```sql
ALTER TABLE bgp_route_history
  ADD COLUMN query_duration_ms integer,
  ADD COLUMN query_executed_at timestamp default current_timestamp;

CREATE INDEX idx_bgp_route_history_device_peer_direction 
  ON bgp_route_history (device_id, peer_ip, direction);

CREATE INDEX idx_bgp_route_history_timestamp 
  ON bgp_route_history (query_executed_at DESC);
```

**Usage:** bgp-routes.service persists on every query (success + error)
- Enables: SSH round-trip analytics, route discovery trends, capacity planning
- Query rate limiting: monitor via query_duration_ms distribution

---

## Validation Matrix

### API Endpoints (BGP Routes)

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| /api/devices/:id/bgp/peers/:peerIp/routes/query | POST | ✅ 200 | SSH pagination, 200-limit, warnings |
| /api/compliance-findings-groups | GET | ✅ 200 | 13 groups, 5 categories in use |
| /api/compliance-findings (with filter) | GET | ✅ 200 | operationalCategory filter working |

### Database Validation

| Table | Change | Status | Notes |
|-------|--------|--------|-------|
| compliance_findings | operationalCategory normalized | ✅ | 500/500 filled, POSSIVEL → FALSO_POSITIVO |
| compliance_jobs | policyProfileName (from v0.2.6) | ✅ | 16/16 jobs have profile reference |
| bgp_route_history | query_duration_ms, query_executed_at | ✅ | New columns, indices created |

### Frontend Validation

| Feature | Status | Notes |
|---------|--------|-------|
| BGP peer routes modal | ✅ | Title, counter, warnings, table, pagination working |
| AS-PATH badges | ✅ | Colored badges, compact layout, ASNs parsed |
| Prefix table | ✅ | Mono font, scrollable, load skeletons |
| Pagination | ✅ | Previous/Next disabled appropriately, page range display |
| Direction logic | ✅ | Client → received, provider/ix/cdn → advertised |

### Selftest Results

```
bgp-prefix-routes-selftest.mjs:
✓ Parser extracts routes and reportedTotal
✓ Commands generated for IPv4/IPv6/VRF variants
✓ Limit capping: 500 → 200
✓ Pagination: page 2 returns 1/3 items
✓ Excess warning triggered on routeCounters > 5000
✓ Route history persisted to DB
Result: PASSED ✅

compliance-policy-tuning-selftest.mjs:
✓ Profiles: 3 active (huawei-vrp-edge-balanced, -strict, -observe-only)
✓ Dual routes: /compliance-policy-profiles AND /compliance/policy-profiles both work
✓ Job creation: accepts policyProfileName parameter
✓ Findings categories: all 6 present
Result: PASSED ✅
```

---

## Security & Compliance

| Check | Status | Details |
|-------|--------|---------|
| SSH read-only validation | ✅ | Whitelisted: `display bgp [ipv6] routing-table peer IP [received\|advertised]-routes` only |
| Excess route protection | ✅ | Hard cap at 200 display rows, warning if device count > 5000 |
| AS-PATH sanitization | ✅ | No secrets in evidence, formatting normalized |
| RBAC enforcement | ✅ | Operator can execute routes query, viewer read-only |
| Audit logging | ✅ | Route queries logged with direction, routesReturned, totalRoutes |

---

## Known Limitations & Future Work

1. **TypeScript Build System:** Existing TS6305 errors on drizzle-orm types (not BGP-routes specific)
   - Workaround: Feature works at runtime despite type check failures
   - Future: Upgrade drizzle-orm or resolve dependency conflicts

2. **BGP Route Caching:** SSH queries not cached (by design, always fresh)
   - Future: Optional cache layer with TTL if needed

3. **Findings UI Grouping:** grouping endpoint returns JSON structure only
   - Future: v0.2.8 frontend agroupment widget with drill-down

4. **Category Labels:** FALSO_POSITIVO standardized (was inconsistent POSSIVEL_FALSO_POSITIVO)
   - Status: All 16 findings updated, no legacy labels remain

---

## Deployment Checklist

- [x] BGP routes parser: dual format, IPv4/IPv6, VRF
- [x] BGP routes service: SSH integration, pagination, limits
- [x] Frontend modal: paginates, warns, displays AS-PATH badges
- [x] Endpoint: /api/devices/:id/bgp/peers/:peerIp/routes/query
- [x] Findings grouping: /api/compliance-findings-groups
- [x] Category normalization: all findings have operationalCategory
- [x] Route history: persistence + indices for analytics
- [x] Audit logging: route query actions logged
- [x] Read-only validation: SSH commands whitelisted
- [x] Selftest: BGP routes + compliance features passing
- [x] Zero breaking changes from v0.2.6

---

## Recommendation

**✅ BGP PREFIX ROUTES FEATURE & COMPLIANCE HARDENING READY FOR MERGE**

No blockers identified. The BGP prefix routes implementation is production-ready with the following caveats:

1. **Monitor** SSH execution times in production (route_duration_ms analytics post-deploy)
2. **Validate** against peers with >100k routes (tested up to limits in device parser)
3. **Plan** v0.2.8 frontend agroupment UI if findings grouping analytics is needed

---

## Release Notes Summary

**New Features (v0.2.7+):**
- BGP prefix routes real-time via SSH with pagination
- AS-PATH parsing + colored badges in modal
- Findings grouping endpoint for analytics
- Route query persistence with duration metrics

**Improvements:**
- Operational category standardization (FALSO_POSITIVO normalization)
- Route history indices for trending queries (analytics-ready)
- Excess volume warnings (>5000 routes, >200 page cap)
- Modal dark theme with load states

**Fixes:**
- All 500 findings have operationalCategory (100%)
- All POSSIVEL_FALSO_POSITIVO → FALSO_POSITIVO (16 findings)

**Infrastructure:**
- Migration 0010: route query logging + analytics indices
- DB persistence: every SSH query logged with metrics
- Read-only whitelist: display bgp routing-table only

---

## Sign-Off

**Tested By:** Automated selftest (bgp-prefix-routes-selftest.mjs) + manual validation  
**Date:** 2026-05-22  
**Status:** ✅ Feature complete, ready to merge to main  
**Next Release:** v0.2.8 (planned: findings agroupment UI + route caching options)
