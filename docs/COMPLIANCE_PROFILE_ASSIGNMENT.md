# Compliance Profile Assignment

**Version:** v0.3.5  
**Date:** 2026-05-23  
**Status:** In Development

---

## Overview

Device compliance profiles allow NOC to calibrate compliance rules per device type, function, and criticality. This reduces false positives and improves actionability.

---

## Available Profiles

### Observe-Only Profiles

**Purpose:** Read-only monitoring, no enforcement, low false-positive risk

#### huawei-vrp-observe-only
- **Target:** VRP devices (general, when profile not specified)
- **Rules:** Basic information collection only (interfaces, BGP, VLANs)
- **Findings:** Informational only, no failures expected
- **False Positives:** Minimal
- **Use Case:** Lab, test, non-production devices

#### huawei-vrp-lab
- **Target:** Lab/test VRP devices
- **Rules:** Same as observe-only
- **Findings:** Warning-only findings (yellow)
- **False Positives:** Expected (ignore)
- **Use Case:** Development, testing, POC

### Balanced Profiles

**Purpose:** Production-ready, moderate enforcement, actionable findings

#### huawei-vrp-edge-balanced
- **Target:** Edge routers (RX, provider, IX role)
- **Rules:**
  - BGP peer state (critical: peer down)
  - BGP community list syntax
  - Route policy completeness
  - NTP configured
  - SNMPv3 if available
  - Management access secured
- **Findings:** Critical + high severity expected
- **False Positives:** Low (< 5%)
- **Action Items:** Typically 2-5 actionable findings per device
- **Use Case:** Production edge routers, critical paths

#### huawei-vrp-access-balanced
- **Target:** Access/aggregation layer (switch, access, aggregation role)
- **Rules:**
  - Interface configuration completeness
  - VLAN assignment consistency
  - Access control lists basic validation
  - MTU matching
  - Loop prevention (BPDU guard, port security)
- **Findings:** Medium + high severity
- **False Positives:** Low (< 5%)
- **Action Items:** Typically 1-3 actionable findings
- **Use Case:** Access/distribution layer, regular audits

### Strict Profiles

**Purpose:** Compliance-grade enforcement, may have higher false-positive rate

#### huawei-vrp-edge-strict
- **Target:** Compliance-audited edge routers
- **Rules:** Edge-balanced + additional
  - BGP community whitelisting
  - Route policy full syntax validation
  - BGP peer group enforcement
  - Logging and syslog mandatory
  - Telemetry/streaming export required
- **Findings:** Critical + high + medium severity
- **False Positives:** Medium (5-15%)
- **Action Items:** Typically 5-10 actionable findings
- **Use Case:** Compliance reporting, audit trails, SLA verification

#### huawei-vrp-access-strict
- **Target:** Compliance auditing of access layer
- **Rules:** Access-balanced + additional
  - VLAN tagging strict enforcement
  - ACL comprehensive auditing
  - MAC address learning limits
  - DHCP snooping if applicable
- **Findings:** Medium + high severity
- **False Positives:** Medium (5-15%)
- **Action Items:** Typically 3-8 actionable findings
- **Use Case:** Compliance audits, security reviews

---

## Profile Assignment Rules

### Default by Role

| Device Role | Default Profile | Rationale |
|-------------|-----------------|-----------|
| RX, border, provider, ix, core | edge-balanced | Production BGP routing |
| edge | edge-balanced | Alternative edge designation |
| access, switch, aggregation | access-balanced | Switching/aggregation |
| customer-edge | access-balanced | Customer site (treat as access) |
| test, lab, internal | observe-only | Non-production |
| unknown | observe-only | Conservative default |

### Override Rules

- **Admin** can override default profile for any device
- **Operator** can choose different profile at runtime (compliance job creation)
- **Viewer** sees assigned profile, cannot change
- Override recorded in audit log with reason
- New compliance jobs use device's assigned profile by default

### Fallback

If device has no assigned profile:
- Use role-based default (see above)
- If role unknown: use huawei-vrp-observe-only
- Log warning in audit

---

## Profile Application

### During Compliance Job Creation

```
1. User selects device
2. System retrieves device.complianceProfileName
3. If null, use role default
4. Operator can override before running job
5. Selected profile recorded in compliance_jobs.profile_name
6. Findings tagged with profile used
```

### Recommendations Generated Per Profile

Each finding includes:

1. **Technical Recommendation** (what to fix)
2. **Operational Impact** (effect of not fixing)
3. **Actionability** (can operator fix immediately?)
4. **Escalation Trigger** (when to escalate)

#### Edge-Balanced Example

Finding: "BGP peer down (AS65001:172.16.1.1)"
- **Tech Rec:** Verify peer IP reachability, check BGP sessions on both sides
- **Op Impact:** Route loss, traffic drop on this peer, failover triggers
- **Actionable:** Yes, check device logs, restart BGP if software bug
- **Escalate:** If peer still down after 5min, escalate to peer network team

#### Observe-Only Example

Finding: "Interface Ge0/0/1 not configured with description"
- **Tech Rec:** N/A (observe-only mode)
- **Op Impact:** None (informational)
- **Actionable:** No (not enforced)
- **Escalate:** No (collect data only)

---

## Database Schema

```sql
ALTER TABLE devices
ADD COLUMN compliance_profile_name TEXT DEFAULT NULL;

-- Index for lookups
CREATE INDEX idx_devices_compliance_profile 
ON devices(compliance_profile_name);
```

```typescript
// TypeScript type
type ComplianceProfile = 
  | "huawei-vrp-observe-only"
  | "huawei-vrp-lab"
  | "huawei-vrp-edge-balanced"
  | "huawei-vrp-access-balanced"
  | "huawei-vrp-edge-strict"
  | "huawei-vrp-access-strict";

// Helper function
function getDefaultProfile(role: string): ComplianceProfile {
  const edgeRoles = ["RX", "border", "provider", "ix", "edge"];
  const accessRoles = ["access", "switch", "aggregation", "customer-edge"];
  const labRoles = ["test", "lab", "internal"];
  
  if (edgeRoles.includes(role)) return "huawei-vrp-edge-balanced";
  if (accessRoles.includes(role)) return "huawei-vrp-access-balanced";
  if (labRoles.includes(role)) return "huawei-vrp-lab";
  return "huawei-vrp-observe-only";
}
```

---

## Audit Logging

All profile changes logged:

```json
{
  "event": "device_compliance_profile_changed",
  "userId": 50,
  "userEmail": "admin@example.com",
  "resource": {
    "deviceId": 1,
    "hostname": "4WNET-BVA-BRT-RX",
    "oldProfile": null,
    "newProfile": "huawei-vrp-edge-balanced",
    "reason": "Assigned default profile for edge router"
  },
  "timestamp": "2026-05-23T10:30:00Z",
  "result": "success"
}
```

---

## UI Integration

### Device Detail Page

```
Device: 4WNET-BVA-BRT-RX
Role: RX
Status: active

[Compliance Profile]
  Current: huawei-vrp-edge-balanced
  [Change Profile v]

[Modal: Change Compliance Profile]
  Device: 4WNET-BVA-BRT-RX (Role: RX)
  
  Select Profile:
    ○ huawei-vrp-observe-only
    ○ huawei-vrp-edge-balanced (default)
    ● huawei-vrp-edge-balanced (current)
    ○ huawei-vrp-edge-strict
  
  Reason (optional):
  [________________]
  
  [Cancel] [Change Profile]
```

### Compliance Job Creation

```
Select Device: [4WNET-BVA-BRT-RX v]
Profile: huawei-vrp-edge-balanced (default for this device)
[ ] Use different profile
  If checked: [Profile Selector v]
  
[Start Compliance Job]
```

---

## Migration Path

### v0.3.5 (Current)
- Add complianceProfileName field to devices
- Define 6 profiles and defaults
- Implement assignment logic
- UI for profile selection
- Audit logging

### v0.3.6+
- Profile customization UI (edit rules per profile)
- Threshold tuning per profile
- Recommendation templates per profile
- Bulk assignment (apply to multiple devices)
- Profile templates by site/network

---

## Future Enhancements

- [ ] Site-level default profile
- [ ] Network-wide profile strategy
- [ ] Threshold tuning per profile
- [ ] Custom profile creation
- [ ] Profile versioning and rollback
- [ ] A/B testing profiles
- [ ] Machine learning profile recommendation

---

## Example Workflows

### Scenario 1: Edge Router

**Device:** 4WNET-BVA-BRT-RX (role=RX)

1. Admin doesn't specify profile
2. System assigns: edge-balanced
3. NOC runs compliance
4. Findings: BGP state, NTP, community list
5. Actionable: 3 findings (fix BGP group, check NTP, update community list)

### Scenario 2: Lab Device

**Device:** rbac-test-1 (role=lab)

1. Admin doesn't specify profile
2. System assigns: observe-only
3. NOC runs compliance
4. Findings: Informational only (interface count, BGP peer count)
5. Actionable: 0 (data collection only)

### Scenario 3: Compliance Audit

**Device:** 4WNET-BVA-BRT-RX (currently edge-balanced)

1. Admin changes: edge-balanced → edge-strict
2. Audit logs change with reason: "Q2 compliance audit prep"
3. NOC runs compliance with new profile
4. Findings increase: +2 findings (logging requirement, streaming requirement)
5. Actionable: 5 findings (higher bar for compliance)

---

## References

- Devices Schema: `workspace/lib/db/src/schema/devices.ts`
- Compliance Engine: `workspace/artifacts/api-server/src/modules/compliance/`
- Device Detail UI: `workspace/artifacts/netops-manager/src/pages/device-detail.tsx`

---

**Status:** ✅ Specification Complete, Implementation In Progress
