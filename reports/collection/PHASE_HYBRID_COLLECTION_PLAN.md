# Phase Plan — Hybrid Collection (H1–H7)

**Phase:** H1 complete (docs only)  
**Next:** H2 — SNMP interface fast state  
**Branch suggestion:** `feature/hybrid-collection-h2-snmp-fast`

---

## Overview

| Phase | Name | Deliverable | SSH/SNMP live |
|-------|------|-------------|---------------|
| **H1** | Docs & contracts | 4 docs + this plan + report | **No** |
| H2 | SNMP interface fast | `operational_interfaces` + API + freshness | Pilot only |
| H3 | SNMP BGP peer state | `operational_bgp_peers` | Pilot only |
| H4 | SSH full-config formal | `collection_snapshots`, raw primary parse | Pilot only |
| H5 | Compliance source-aware | Finding provenance, UNKNOWN rules | No new collect |
| H6 | SSH detail on-demand | Detail API + audit + allowlist | On demand |
| H7 | UI freshness & source | Badges, warnings, detail buttons | No |

---

## H1 — Documentation & contracts ✅

**Scope:** Architecture, data contract, safety checklist, implementation plan.

**Exit criteria:**

- [x] `docs/collection/HYBRID_COLLECTION_ARCHITECTURE.md`
- [x] `docs/collection/COLLECTION_DATA_CONTRACT.md`
- [x] `docs/collection/SAFE_COLLECTION_CHECKLIST.md`
- [x] `reports/collection/PHASE_HYBRID_COLLECTION_PLAN.md`
- [x] `reports/collection/PHASE_HYBRID_COLLECTION_PLAN_REPORT.md`
- [x] Zero live SSH/SNMP in this phase

---

## H2 — SNMP interface fast state

**Goal:** Dashboards read operational interface state without full-config.

**Tasks:**

1. Migration: `operational_interfaces` table (+ indexes on `device_id`, `interface_name`).
2. Service: `SnmpFastInterfaceCollector` — reuse OID walk from `snmp-readonly-adapter` / `collectors/snmp.collector.ts`.
3. Persist: insert/upsert with `source=snmp`, `collected_at`, compute `freshness_status`.
4. API: `GET /api/devices/:id/operational/interfaces` with provenance.
5. API: `POST /api/devices/:id/collection/snmp-fast` (or extend existing `collect/read-only`).
6. Scheduler stub (disabled by default): `NETOPS_SNMP_FAST_SCHEDULE_ENABLED=false`.
7. UI (minimal): device detail — last SNMP time + fresh/stale on interface list.
8. Tests: unit normalize; integration with mocked SNMP; no prod devices without flag.

**Dependencies:** `NETOPS_SNMP_REAL_ENABLED` pattern from FASE 5.

**Risks:** ifName vs ifDescr mismatch vs config parser — document mapping table.

**Estimate:** 3–5 dev days.

---

## H3 — SNMP BGP peer state

**Goal:** Operational peer table from BGP4-MIB (IPv4); gaps documented for IPv6.

**Tasks:**

1. Migration: `operational_bgp_peers`.
2. Extend SNMP collector: peer state, remote AS, uptime, prefix OIDs where available.
3. API: `GET /api/devices/:id/operational/bgp-peers`.
4. Merge policy: do not overwrite `config_bgp_peers` (H4).
5. UI: BGP list shows operational state column with SNMP badge.
6. Manual role overrides still applied after load (existing behavior).

**Risks:** IPv6 peers absent from BGP4-MIB — show `unknown` not guess.

**Estimate:** 2–4 dev days (after H2).

---

## H4 — SSH full-config snapshot formal

**Goal:** Single authoritative config snapshot per device with explicit snapshot row.

**Tasks:**

1. Migration: `collection_snapshots` (+ optional `collection_jobs`).
2. Refactor `persistSshDiscoveryToNetopsStores` → write `collection_snapshots` + link `collected_configs`.
3. Full-config job: only `display current-configuration` (+ optional slices) via allowlist.
4. Parser entry: always `parseHuaweiPolicyDependencyPipeline(raw)` → persist `policy_dependency_catalogs` JSON keyed by `snapshot_id`.
5. **Mandatory:** `buildPolicyDependencyConfigFromSnapshot` always prefers `rawConfig` — commit `bgp-checks` path.
6. Deprecation plan: `snapshot_json.parsed_config` written as derived cache with `derivedFromSnapshotId` + hash.
7. API: `POST /collection/full-config`, `GET /collection/snapshot/latest`.
8. Dedup by `content_hash`.

**Dependencies:** H1 contracts; existing parsers.

**Risks:** large configs — payload size limits, compression, DB TOAST.

**Estimate:** 5–8 dev days.

---

## H5 — Compliance source-aware

**Goal:** Findings show plane + source; UNKNOWN when catalog missing.

**Tasks:**

1. Extend `StructuredFinding` metadata per `COLLECTION_DATA_CONTRACT.md`.
2. Split checks: `operational-*` vs `config-*` policy keys in `bgp-checks.ts` / compliance profiles.
3. Compliance engine: resolve `configSnapshotId` = latest non-expired `ssh_full_config` snapshot.
4. Dependency loop: UNKNOWN if `catalog_status.ipv6_prefixes !== loaded` and no raw.
5. Remove conflation: `Cliente X sem import policy` should read `config_bgp_peers` when available (follow-up fix).
6. Report export: include provenance columns.
7. Selftest: catalog empty → UNKNOWN; catalog loaded + missing ref → MISSING.

**Dependencies:** H4 strongly recommended; can partial with `rawConfig` from `collected_configs`.

**Estimate:** 4–6 dev days.

---

## H6 — SSH detail on-demand

**Goal:** Modals and investigations without mass collect.

**Tasks:**

1. API: `POST /api/devices/:id/collection/detail` with `DetailKind` + target.
2. Command builder: parameterized templates from allowlist only.
3. Rate limit + permission `collection.detail.execute`.
4. Bulk guard: reject array &gt; 1 target without `collection.detail.bulk`.
5. Persist: `discovery_evidence` + `collection_snapshots` scope `detail:*`.
6. BGP routes: wire to existing `bgp-routes.service.ts` with provenance.
7. L2: align `L2_SSH_COMMANDS` with detail kinds.
8. Audit events on every detail call.

**Dependencies:** H4 parent snapshot optional but recommended for context display.

**Estimate:** 5–7 dev days.

---

## H7 — UI freshness & source

**Goal:** Operator sees data age and origin; no silent stale compliance.

**Tasks:**

1. Device header: last SNMP / last full-config timestamps + badges.
2. Compliance page: banner if `config snapshot expired`.
3. Finding detail drawer: provenance fields, `dependencyType` label (ipv6-prefix vs ip-prefix).
4. Peer modal: tabs Operational (SNMP) | Config (full-config) | Detail (on-demand).
5. Disable auto full-config on navigation.
6. Cache tooltip component reused across Devices, BGP, L2, Compliance.

**Dependencies:** H2–H6 APIs.

**Estimate:** 4–6 dev days.

---

## Cross-cutting work (all phases)

| Item | Owner phase |
|------|-------------|
| Allowlist updates | H4, H6 |
| OpenAPI / zod schemas | H2+ |
| Drizzle migrations | per phase |
| Pilot runbook update | H2 pilot |
| Metrics | H2+ |

---

## Migration from current model

```text
snmp_snapshots (collector=snmp)     → operational_* + collection_snapshots(snmp_fast)
snmp_snapshots (collector=ssh)        → stop dual-use; SSH → collection_snapshots only
collected_configs                   → keep; FK to collection_snapshots
discovery_snapshots                 → gradual; compliance moves to collection_snapshots id
POST /devices/:id/discover          → split flags: contexts + layer=fast|full
```

**Compatibility window:** 2 releases — old endpoints proxy to new tables.

---

## Pilot devices

Use `reports/V0_3_4_PILOT_DEVICES.md` — start with device `1` (4WNET-BVA-BRT-RX) after H2 flag on in lab.

---

## Success metrics

| Metric | Target |
|--------|--------|
| Dashboard interface status latency | &lt; 5 min data age (SNMP schedule) |
| Compliance configurational UNKNOWN without raw | 100% (no false FAIL) |
| Full-config age visible on compliance UI | 100% devices with compliance run |
| Detail commands without allowlist reject | 0 in audit |
| Blind cache incidents | 0 |

---

## GO/NO-GO gates

| Gate | Condition |
|------|-----------|
| Start H2 | H1 docs approved; SNMP flag process agreed; pilot list set |
| Start H4 | H2 operational interfaces stable 1 week in lab |
| Start H5 | H4 raw-primary parse in production pilot |
| Start H6 | H5 compliance provenance in UI |
| Fleet expand | SAFE_COLLECTION_CHECKLIST pilot section signed |
