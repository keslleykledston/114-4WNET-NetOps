# Service Correlation v0.9.5

Correlação entre falhas de infraestrutura e serviços impactados.

## Problem

Today:
- Alert: "L2VC-100 DOWN"
- Question: "Which customers care?"

Need: Automatic correlation of failures to services.

## Solution

**Topology Graph** → Service nodes linked to L2 circuits, VRFs, devices, BGP peers
**Impact Analysis** → Traverse graph from failure point to services

## Models

### Service Dependencies

Service → depends on:
- L2VC (circuit ID)
- VRF (RD/RT)
- BGP peer (AS)
- Device (primary/backup)
- Resource (VLAN, VC_ID, RD, RT)

### Correlation Types

1. **Direct** — Service directly uses failed component
   ```
   SERVICE --[SERVICE_USES_CIRCUIT]--> L2VC (DOWN) → IMPACT
   ```

2. **Redundancy** — Service has backup, but...
   ```
   SERVICE --[PRIMARY]--> L2VC-1 (DOWN)
   SERVICE --[BACKUP]--> L2VC-2 (OK)
   → Service OK but no redundancy
   ```

3. **Transitive** — Failure cascades through dependencies
   ```
   DEVICE (DOWN) → L2VC → SERVICE → CUSTOMER
   ```

4. **Resource Collision** — Multiple services share resource
   ```
   SERVICE-1 --[USES]--> VLAN-100
   SERVICE-2 --[USES]--> VLAN-100
   → Collision on VLAN-100
   → Both services at risk
   ```

## Query Examples

### Find services affected by L2VC failure
```
START: L2_CIRCUIT(100)
↓
[SERVICE_USES_CIRCUIT]
↓
SERVICE nodes
↓
[HAS_CUSTOMER]
↓
CUSTOMER nodes
```

Result: List of affected customers

### Find services without redundancy
```
SELECT SERVICE WHERE
  (backup_device IS NULL)
  AND (backup_circuit IS NULL)
```

### Find resource collisions
```
SELECT RESOURCE WHERE
  allocation_count > 1
  AND allocations_by_different_services > 0
```

## UI Elements

### Service Detail View

Add section:
```
Dependencies
├─ Primary L2VC: L2VC-100 (Down) ⚠️
├─ Backup L2VC: L2VC-200 (Up) ✓
├─ Primary BGP: AS65001/10.0.0.1 (Down) ⚠️
├─ VRF: Customer-A (OK)
└─ Resources
   ├─ VLAN: 100 (no collision) ✓
   └─ VC_ID: 1001 (no collision) ✓

Risk Assessment: CRITICAL
├─ Primary path down
├─ No redundancy
└─ Customer impact: HIGH
```

### Dashboard Widget

"Service Health by Risk"
```
At Risk (no backup):        5 services
Degraded (1 of 2 paths):   2 services
Healthy:                    45 services
```

### Scenario Drill-Down

When opening scenario:
```
Scenario: L2VC-100 DOWN

Affected Services:
├─ Service-1 (CRITICAL)
│  ├─ Customer: Acme Corp
│  ├─ Dependency: PRIMARY path
│  ├─ Backup: None
│  └─ Impact: Full outage
├─ Service-2 (WARNING)
│  ├─ Customer: Beta Inc
│  ├─ Dependency: SECONDARY path
│  ├─ Backup: VLAN-200
│  └─ Impact: Degradation
```

## Integration Points

1. **Service Catalog** → Service metadata (dependencies)
2. **Resource Manager** → Allocation tracking (collisions)
3. **Topology Intelligence** → Graph structure (paths)
4. **Compliance** → Risk scoring (criticality)

## Alerting

When scenario created with CRITICAL severity:
- Notify oncall for affected customers
- Create ticket for incident mgmt
- Trigger escalation if SLA at risk

---

**Version:** v0.9.5
**Status:** Specification Complete
**Implementation:** Ready for Phase v0.9.6+
