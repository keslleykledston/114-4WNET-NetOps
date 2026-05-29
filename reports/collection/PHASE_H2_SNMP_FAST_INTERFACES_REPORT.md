# PHASE H2 — SNMP_FAST interfaces (status report)

**Date:** 2026-05-26  
**Phase:** H2 planning closed; **implementation not started** (awaiting GO checklist)  
**SSH / discovery executed:** **No**  
**SNMP executed:** **No**

---

## Summary

Issue/plano H2 criado em `docs/collection/H2_SNMP_FAST_INTERFACES_PLAN.md`. Objetivo: **1 piloto**, interfaces operacionais, freshness, GET read-only — **zero** uso para compliance configuracional.

---

## Deliverables (this phase)

| Item | Path | Status |
|------|------|--------|
| Plan | `docs/collection/H2_SNMP_FAST_INTERFACES_PLAN.md` | ✅ |
| Report | `reports/collection/PHASE_H2_SNMP_FAST_INTERFACES_REPORT.md` | ✅ |

---

## GO checklist for implementation (copy from plan)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Pilot `device_id` defined + enforced | ⏳ operator confirms (default: `1`) |
| 2 | Credential profile resolved; no secret in logs/API | ⏳ `devices.snmpCommunity` + env gate |
| 3 | SNMP timeout defined (60s / retries 4 align current) | ✅ proposed |
| 4 | Rate-limit defined (1 collect / device / 5 min) | ✅ proposed |
| 5 | Table + API contract in plan | ✅ `operational_interfaces` + GET |
| 6 | `SAFE_COLLECTION_CHECKLIST.md` §2 applicable | ✅ |
| 7 | Zero bulk / no fleet scheduler | ✅ rule in plan |

**Overall GO to code:** quando linhas 1–2 preenchidas em ambiente lab + aprovação explícita.

---

## Alignment with H1 architecture

- **SNMP_FAST** = operational only; separate from `SSH_FULL_CONFIG` / compliance.
- **raw_config > parsed_config** — unchanged; H2 não toca compliance.
- Operational state ≠ configurational FAIL — H2 data must not feed `bgp-checks` / policy dependency without separate H5 design.

---

## Code reuse notes (for implementers)

- `SNMP_OIDS.ifLastChange` exists; `collectInterfaces` does not walk it yet — add in H2.2.
- `ifHighSpeed` OID not in `oids.ts` yet — add `1.3.6.1.2.1.31.1.1.1.15`.
- Existing `snmp_snapshots.interfaces_json` can coexist during migration.

---

## Next actions (human)

1. Confirm pilot `device_id` + lab SNMP community on device record.
2. Set `NETOPS_SNMP_REAL_ENABLED=true` only on lab stack.
3. Approve H2.1 PR scope (migration + GET only, no collect trigger) vs full H2.2 in one PR.
4. Track issue title suggestion: **`[H2] SNMP_FAST operational_interfaces + GET (pilot=1)`**

---

## Verdict

| Gate | Result |
|------|--------|
| H2 planning complete | **GO** |
| H2 implementation | **NO-GO** until checklist rows 1–2 + explicit authorize |

---

*No SNMP packets sent during this report.*
