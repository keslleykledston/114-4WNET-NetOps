# PHASE BGP Peer Drilldown — Plan (D1–D5)

**Date:** 2026-05-26  
**Phase:** BGP-D1 complete (documentation only)  
**SSH / discovery executed:** **No**

---

## Summary

Define **BGP Peer Drilldown**: top-down view of one Huawei VRP peer for NOC/engineering — operational status, root/family config, route-policies, dependency objects, and optional route-table validation.

Global compliance remains separate.

---

## Deliverables (BGP-D1)

| # | File | Status |
|---|------|--------|
| 1 | `docs/bgp/BGP_PEER_DRILLDOWN_ARCHITECTURE.md` | ✅ |
| 2 | `docs/bgp/BGP_PEER_DRILLDOWN_SAFE_CHECKLIST.md` | ✅ |
| 3 | `docs/bgp/BGP_PEER_DRILLDOWN_DATA_CONTRACT.md` | ✅ |
| 4 | `reports/bgp/PHASE_BGP_PEER_DRILLDOWN_PLAN.md` | ✅ |

---

## Architectural decisions

| Decision | Rationale |
|----------|-----------|
| Top-down 5 steps | Matches Huawei CLI mental model and NOC workflow |
| Reuse `bgp-peer-dependency-parser` | Root vs family already fixed in compliance path |
| Reuse policy dependency pipeline | IPv4/IPv6 prefix, community deps with FOUND/MISSING/UNKNOWN |
| Separate from compliance job | Drilldown is investigative; compliance stays batch profile |
| D2 = snapshot only | No SSH until safety + UI contract proven |
| Heavy routes in D5 | received/accepted/advertised need confirmation + limits |
| `GET .../drilldown` | Read model; heavy actions = separate POST with confirm |
| SNMP for runtime only | Policy names from config, not from BGP4-MIB |
| raw_config > parsed_config | Same rule as H1/compliance runtime fix |

---

## Alignment with existing code

| Asset | Drilldown use |
|-------|----------------|
| `bgp-peer-dependency-parser.ts` | Step 2 root/family + group inheritance |
| `policy-dependency-pipeline.ts` | Step 3–4 policy + catalog resolution |
| `buildPolicyDependencyConfigFromSnapshot(_, { rawConfig })` | D2 entry point |
| `POST .../bgp/peers/:ip/routes/query` | D5 route slice (extend, don't replace) |
| `GET .../netops/devices/:id/bgp-peers/:peerIp` | Merge into drilldown or redirect |
| H2 `operational_bgp_peers` (H3) | Step 1 runtime when available |

---

## Phase breakdown

### BGP-D1 — Documentation ✅

- Architecture, checklist, this plan
- JSON contract `BgpPeerDrilldownResult`
- Command weight classes L / H / X

**Exit:** docs only, no code.

---

### BGP-D2 — Drilldown from snapshot (next)

**Scope:**

- Service `buildBgpPeerDrilldown(deviceId, peerIp, options)` from latest `collected_configs.raw_config`
- Optional merge SNMP operational state if present
- `GET /api/bgp/peers/:deviceId/:peerIp/drilldown`
- Query: `include_runtime`, `include_policies`, `include_policy_objects`; `include_routes=false` hard default
- Unit tests with fixture containing WIFIZAO peer (`bgp-peer-dependencies.txt` + policy fixtures)
- Report: `reports/bgp/PHASE_BGP_PEER_DRILLDOWN_D2_REPORT.md`

**Out of scope D2:** SSH, route tables, UI.

**Estimate:** 4–6 dev days.

---

### BGP-D3 — UI drilldown (snapshot)

- Peer modal/page: sections 1–7 from architecture
- Dependency tree component
- Freshness from config snapshot timestamp
- No route buttons active until D5

**Estimate:** 3–5 dev days (after D2 API stable).

---

### BGP-D4 — SSH detail (light)

- Allowlist entries for peer verbose + route-policy + object displays
- `POST /api/bgp/peers/:deviceId/:peerIp/drilldown/refresh?scope=runtime|policies|objects`
- Evidence rows in `discovery_evidence` or drilldown-specific table
- Pilot device allowlist (reuse `SNMP_FAST_PILOT_DEVICE_IDS` pattern or `BGP_DRILLDOWN_PILOT_DEVICE_IDS`)

**Estimate:** 5–7 dev days.

---

### BGP-D5 — Route tables on demand

- Confirmation token + Tier H checklist
- Integrate with existing `bgp-routes.service.ts` / route history
- Limits, timeout, `keep-all-routes` warning
- UI: three buttons with impact banner

**Estimate:** 4–6 dev days.

---

## Example peer acceptance (WIFIZAO)

| Check | Expected (from config) |
|-------|------------------------|
| Root AS | 262663 |
| Description | WIFIZAO.BRT |
| ipv4_unicast enabled | yes |
| Import policy | AS262663-WIFIZAO.BRT-Import-IPv4 |
| Export policy | AS262663-WIFIZAO.BRT-Export-IPv4 |
| default-route-advertise | true |
| Policy deps | FOUND when prefix/community in raw_config |

---

## Risks

| Risk | Mitigation |
|------|------------|
| `display ... \| begin PEER` not on allowlist | D2 uses full bgp config parse; D4 add slice if approved |
| Huge route-table output | Tier H limits + truncation |
| VRF-scoped peers | Parser must key peer + vrf in `families[]` |
| Duplicate logic vs compliance | Single builder module shared by compliance + drilldown |
| Stale snapshot | Show `collectedAt` + expired banner |

---

## GO / NO-GO — start BGP-D2?

| Criterion | Status |
|-----------|--------|
| D1 docs complete | ✅ |
| `raw_config` runtime path committed (`42c2b61`) | ✅ |
| `bgp-peer-dependency-parser` stable | ✅ |
| Pilot device with cached full-config | operator-dependent |
| API contract agreed | ✅ in architecture doc |

**Verdict: GO for BGP-D2** — implement snapshot-based drilldown + GET endpoint, no SSH.

**NO-GO for D4/D5** until D2 API reviewed and checklist signed for Tier H.

---

## Suggested issue title

`[BGP-D2] Peer drilldown from raw_config snapshot (GET /api/bgp/peers/:id/:peer/drilldown)`

---

*BGP-D1: documentation only. No SSH. No discovery.*
