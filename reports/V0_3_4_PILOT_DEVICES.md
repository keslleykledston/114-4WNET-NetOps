# v0.3.4 Operational Pilot — Pilot Devices

**Date:** 2026-05-22  
**Status:** Pilot Selection Complete  
**Devices:** 3 devices Huawei VRP (active)

---

## Pilot Devices Matrix

| Device ID | Hostname | Vendor | Platform | Role | Site | Status | Profile | SSH | SNMP |
|-----------|----------|--------|----------|------|------|--------|---------|-----|------|
| 1 | 4WNET-BVA-BRT-RX | huawei | vrp | RX | BVA-BRT | active | Primary Edge | ✓ | ✓ |
| 2 | 4WNET-BVA-BRT-RA | huawei | vrp | RA | BVA-BRT | active | Secondary Edge | ✓ | ✓ |
| 3 | 4WNET-BVA-CDS-RX | huawei | vrp | RX | BVA-CDS | active | Access/Distribution | ✓ | ✓ |

---

## Rationale

### Device 1: 4WNET-BVA-BRT-RX (ID=1)
**Purpose:** Primary edge router  
**Why:** VRP edge platform with BGP, multiple interface types, real BGP peers  
**Coverage:** SSH config collection, SNMP interface stats, BGP peer discovery, route queries, compliance checks  
**Expected:** ✓ Full connectivity, rich config, actionable findings

### Device 2: 4WNET-BVA-BRT-RA (ID=2)
**Purpose:** Secondary edge (RA role)  
**Why:** Alternative edge role, validates role-specific behavior  
**Coverage:** Device discovery, config validation, different compliance rules  
**Expected:** ✓ SSH/SNMP working, different findings pattern

### Device 3: 4WNET-BVA-CDS-RX (ID=3)
**Purpose:** Access/distribution layer  
**Why:** Tests non-edge device, different port density, access control  
**Coverage:** Interface compliance, VLAN validation, basic routing  
**Expected:** ✓ Simpler config, fewer BGP findings

---

## Pilot Workflow

For each device, execute:

1. **Connectivity Test** — SSH + SNMP alive?
2. **Config Collection** — Retrieve running-config via SSH
3. **Device Discovery** — Parse interfaces, VLANs, BGP peers, routes
4. **BGP Inspection** — List peers, query received/advertised routes
5. **Compliance Scan** — Run balanced profile (not strict, not observe-only)
6. **Report Download** — Export findings to markdown + CSV
7. **Audit Verification** — Confirm all actions logged

---

## Expected Outcomes

### Connectivity
- ✓ SSH keyboard-interactive auth working
- ✓ SNMP v2c read working
- ✓ Timeout/error handling sane

### Config Collection
- ✓ Full config retrieved (no truncation)
- ✓ Evidence sanitization working (no passwords exposed)
- ✓ Config parsing not erroring out

### Discovery
- ✓ Interfaces detected
- ✓ BGP peers identified
- ✓ VRFs/L3VPNs parsed
- ✓ Snapshot persisted to DB

### BGP
- ✓ Peer details retrieved (admin status, neighbor, route counts)
- ✓ Route query working for at least 1 peer
- ✓ AS-PATH parsed correctly
- ✓ BGP communities preserved (not redacted)

### Compliance
- ✓ Profile applied correctly
- ✓ Checks run without timeout
- ✓ Findings generated (mix of pass/fail expected)
- ✓ Evidence sanitized

### Export
- ✓ Markdown report renders correctly
- ✓ CSV parseable by spreadsheet
- ✓ JSON valid object
- ✓ No secrets in any export

### Audit
- ✓ All actions logged (test_connectivity, discovery, compliance, export)
- ✓ Actor (user) recorded
- ✓ Timestamp accurate
- ✓ Sensitive fields sanitized in logs

---

## Non-Pilot Devices

| ID | Hostname | Status | Reason |
|----|----------|--------|--------|
| 28 | test-router-1 | unknown | Cisco IOS (not Huawei VRP) — out of scope for v0.3.4 pilot |
| 29 | test-router-2 | unknown | Customer role (different policy) — defer to v0.3.4.x |
| 4 | rbac-test-* | unknown | Test device (not production) — not representative |

---

## Success Criteria

✅ Pilot complete if:
1. All 3 devices SSH + SNMP connected
2. All 3 devices discovery full success
3. At least 1 device with BGP route query success
4. All 3 devices compliance job completion
5. Reports downloadable, valid format, no secrets
6. Audit log complete (10+ events per device)
7. No data loss/corruption
8. No unhandled exceptions in logs

❌ Escalate if:
- SSH fails on 2+ devices → auth config issue
- Discovery hangs/times out → command allowlist or parsing issue
- Compliance fails on all → policy profile incompatible
- Export fails → encoding/sanitization bug
- Audit gaps → logging middleware broken

---

## Timeline

| Phase | Task | Est. Time | Owner |
|-------|------|-----------|-------|
| 1 | Connect to devices, verify SSH/SNMP | 5 min | Operator |
| 2 | Run discovery full on all 3 | 10 min | Operator |
| 3 | Query BGP on applicable devices | 5 min | Operator |
| 4 | Run compliance balanced on all 3 | 15 min | Operator |
| 5 | Download reports (3 × 3 formats) | 5 min | Operator |
| 6 | Review audit logs | 5 min | Operator |
| 7 | Collect feedback, screenshot UX | 10 min | Operator |
| **Total** | | **~55 min** | |

---

## Contact

**Pilot Coordinator:** NetOps Team  
**Device Admin:** Site Admin (BVA, CDS)  
**Support:** Engineering on-call  

**Escalation Path:** Issue → Slack #netops-pilot → Daily standup → Engineering

---

**Status:** ✅ Ready for TAREFA 2 (Fluxo Operacional)
