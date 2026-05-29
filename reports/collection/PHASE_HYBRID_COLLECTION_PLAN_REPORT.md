# PHASE H1 Report — Hybrid Collection Architecture & Plan

**Date:** 2026-05-26  
**Phase:** H1 — Documentation & contracts only  
**Verdict:** **GO** to start H2 (with conditions)  
**SSH/SNMP executed this phase:** **No**

---

## 1. Deliverables

| # | File | Status |
|---|------|--------|
| 1 | `docs/collection/HYBRID_COLLECTION_ARCHITECTURE.md` | ✅ Created |
| 2 | `reports/collection/PHASE_HYBRID_COLLECTION_PLAN.md` | ✅ Created |
| 3 | `docs/collection/COLLECTION_DATA_CONTRACT.md` | ✅ Created |
| 4 | `docs/collection/SAFE_COLLECTION_CHECKLIST.md` | ✅ Created |
| 5 | `reports/collection/PHASE_HYBRID_COLLECTION_PLAN_REPORT.md` | ✅ This file |

**Acceptance (phase H1):**

- [x] Docs created
- [x] No SSH/SNMP executed
- [x] Plan clear (H2–H7)
- [x] Data contracts defined
- [x] Next steps ready

---

## 2. Architectural decisions

| Decision | Rationale |
|----------|-----------|
| **Three layers** — SNMP_FAST, SSH_FULL_CONFIG, SSH_DETAIL | Separates cost, cadence, and truth domain |
| **raw_config &gt; parsed_config** | Fixes blind cache; validated in compliance smoke job #62 |
| **UNKNOWN when catalog empty** | Prevents FAIL without evidence (prefix/peer fixes precedent) |
| **Operational vs configurational planes** | SNMP Idle ≠ missing route-policy |
| **New `collection_snapshots` + `operational_*`** | Cleaner than overloading `snmp_snapshots` for both snmp and ssh |
| **Keep `collected_configs`** | Backward compat; link to snapshot FK in H4 |
| **Detail never replaces full-config** | Route tables / verbose are point-in-time enrichment |
| **Allowlist gate unchanged** | Reuse `huawei-vrp/commands.ts`; extend per detail template in H6 |
| **Additive discovery preserved** | Aligns with `DISCOVERY_PERSISTENCE_MODEL.md` |
| **Legacy discover endpoint** | Split in H4/H5; proxy during 2-release window |

---

## 3. Alignment with current codebase

| Existing asset | Hybrid mapping |
|----------------|----------------|
| `collected_configs.raw_config` | SSH_FULL_CONFIG payload |
| `discovery_snapshots.snapshot_json` | Transitional parsed cache → derived only |
| `buildPolicyDependencyConfigFromSnapshot(_, { rawConfig })` | H4 mandatory path (partially in working tree) |
| `snmp_snapshots` + `POST collect/read-only` | H2 SNMP_FAST precursor |
| `bgp-peer-dependency-parser.ts` | Config plane peer model |
| `policy-dependency-pipeline.ts` | Catalog + dependency resolver |
| `discovery_evidence` | SSH_DETAIL evidence store |
| `bgp_route_history` | SSH_DETAIL routes |
| Compliance finding `freshness` | Engine version supersession — **add** collection TTL freshness in H5/H7 |
| `docs/SSH_SNMP_FALLBACK_FLOW.md` | Superseded in spirit by this model; keep until H4 migration note added |

---

## 4. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Dual-write `snmp_snapshots` + new tables | Confusion during migration | H2 write snmp + operational; deprecate ssh label on snmp_snapshots |
| Large `raw_config` in DB | Storage/backup pressure | Hash dedup; optional compression; retention policy |
| IPv6 BGP not in BGP4-MIB | Incomplete operational peer list | Document gap; config plane still authoritative |
| `bgpPeers[]` flat snapshot vs `config_bgp_peers` | False "sem import policy" | H5 refactor customer/transit checks to config plane |
| Scheduler + flags proliferation | Ops complexity | Single `NETOPS_COLLECTION_*` namespace doc in H2 |
| Pilot SSH/SNMP on production | Outage risk | Lab first; read-only; checklist mandatory |
| Parser version drift | Stale findings | Pin `parser_version` on snapshot; compliance metadata |

---

## 5. Next phases (summary)

| Phase | Focus | Prereq |
|-------|-------|--------|
| **H2** | SNMP → `operational_interfaces` | H1 approval, SNMP flag process |
| H3 | SNMP → `operational_bgp_peers` | H2 stable |
| H4 | `collection_snapshots` + raw-primary parse | H2 recommended |
| H5 | Compliance provenance + UNKNOWN | H4 (or rawConfig commit) |
| H6 | Detail API + audit | H4, allowlist review |
| H7 | UI freshness badges | H2–H6 APIs |

---

## 6. GO/NO-GO — start H2?

| Criterion | Status |
|-----------|--------|
| H1 docs complete | ✅ |
| Safety checklist exists | ✅ |
| Contracts stable enough to implement | ✅ |
| Compliance prefix/peer fixes stable | ✅ (runtime GO job #62) |
| rawConfig re-parse committed to main | ⚠️ **Recommend commit before H4** (in working tree) |
| Lab SNMP credentials available | Operator-dependent |
| Flags default off | ✅ existing pattern |

**Verdict: GO for H2** — start with schema + read API + mocked tests; enable `NETOPS_SNMP_REAL_ENABLED` only on lab device after checklist §10.

**NO-GO if:** production-wide SNMP schedule without pilot sign-off; or H4 skipped while compliance still reads stale `parsed_config` only.

---

## 7. Immediate actions (post-H1)

1. Review docs with NOC + compliance owners (30 min).
2. Commit `buildPolicyDependencyConfigFromSnapshot(snapshot, { rawConfig })` if not on `8332969` branch.
3. Open tracking issue: `hybrid-collection-h2-snmp-fast`.
4. Add cross-links from `docs/DEVICE_DISCOVERY_ARCHITECTURE.md` → `docs/collection/HYBRID_COLLECTION_ARCHITECTURE.md`.
5. Do **not** enable collection flags in compose until H2 pilot plan signed.

---

## 8. References

- Compliance smoke: `reports/compliance/PHASE_COMPLIANCE_PREFIX_PEER_RUNTIME_SMOKE_REPORT.md`
- Prefix fix: `reports/compliance/PHASE_BGP_IPV4_IPV6_PREFIX_POLICY_FALSE_POSITIVE_FIX_REPORT.md`
- Peer fix: `reports/compliance/PHASE_BGP_PEER_DEPENDENCY_CONTEXT_FIX_REPORT.md`
- L2: `docs/l2-circuits/L2_CURRENT_STATE.md`

---

*H1 complete. No code. No live collection.*
