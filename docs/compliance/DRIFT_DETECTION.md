# Drift Detection — FASE v0.9.0

## Overview

Drift Detection compares device expected state (from service catalog) vs actual collected config to identify configuration gaps.

**NOT an alert system** — drifts are data, alerts are operational decisions.

## Data Flow

```
SSH Config Bundle
      ↓
   Collected Config (rawConfig)
      ↓
Expected State Builder
      │─ Query service requests (APPROVED/PROVISIONED)
      │─ Map to service catalog (service type)
      │─ Build requirements per service type
      │
Drift Detector
      │─ Compare expected vs actual
      │─ Generate diff summary
      │─ Insert into compliance_drifts
      ↓
Compliance Findings (separate path)
      │─ These are policy violations
      ↓
Alert Engine (optional)
      └─ Surfaces as CONFIG_DRIFT_DETECTED alert
```

## Expected State

Expected state is built from active service requests on device.

**Example:**

Device has 2 active requests:
- Service Catalog ID 3: BGP Customer (bgp_peer_customer)
  - Requires: description, import_policy, export_policy, community_filter
- Service Catalog ID 7: VRF (l3vpn_vrf)
  - Requires: rd, rt_import, rt_export

**Global Requirements** (always checked):
- ntp (must be configured)
- snmp (must be configured)
- aaa (must be present)

## Drift Detection Algorithm

For each requirement field:

1. Check if field exists in collected config using regex pattern
2. Record expected=true, actual=true/false
3. If any required field is missing, generate drift summary

**Patterns (simplified):**
```
description  → /description\s+["']?[\w\-\.]+/i
import_policy → /route-policy\s+\S+\s+import/i
export_policy → /route-policy\s+\S+\s+export/i
community_filter → /community-filter|community-list/i
rd → /vpn-target|route-distinguisher|rd\s+[\d:]+/i
ntp → /ntp\s+server|ntp-service\s+enable/i
snmp → /snmp-agent.*community/i
...
```

## Drift Struct

```sql
CREATE TABLE compliance_drifts (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL,
  service_request_id INTEGER,
  expected_state_json JSONB,      -- { "bgp_customer.description": true, ... }
  actual_state_json JSONB,        -- { "bgp_customer.description": false, ... }
  drift_summary TEXT,             -- "Missing fields: description, import_policy"
  created_at TIMESTAMP DEFAULT NOW()
);
```

## APIs

**Trigger (auto after SSH bundle):**
```http
POST /api/compliance/run/device/:id  -- auto-calls detectDriftForDevice()
```

**Query:**
```http
GET /api/devices/:id/drift              -- latest drifts for device
GET /api/compliance/drifts              -- all drifts (paginated)
GET /api/compliance/drifts?deviceId=:id -- filter by device
```

**Response:**
```json
{
  "id": 42,
  "deviceId": 5,
  "serviceRequestId": null,
  "expectedStateJson": {
    "bgp_peer_customer.description": true,
    "bgp_peer_customer.import_policy": true
  },
  "actualStateJson": {
    "bgp_peer_customer.description": false,
    "bgp_peer_customer.import_policy": true
  },
  "driftSummary": "Drift Summary:\nMissing fields:\n  - description (expected but not found)",
  "createdAt": "2026-05-31T10:23:45.000Z"
}
```

## Integration with Compliance Engine

**Separate paths:**

1. **Compliance Engine** evaluates rules → findings (130+ policies)
2. **Drift Detector** compares expected vs actual → drifts (from service catalog)

**Same trigger, different outputs:**
- Compliance failing → policy violation
- Drift detected → configuration gap vs service plan

**Both can alert:**
- CRITICAL_COMPLIANCE_FAILURE (severity=CRITICAL)
- CONFIG_DRIFT_DETECTED (severity=WARNING)

## Adding Expected State Requirements

Edit `expected-state-builder.ts`:

```ts
const REQUIREMENT_TEMPLATES: Record<string, ...> = {
  my_service_type: {
    my_field: { field: "my_field", required: true, description: "My field requirement" },
  },
};
```

Then in `drift-detector.ts`, add pattern to `fieldExistsInConfig()`:

```ts
const searchPatterns: Record<string, RegExp> = {
  my_field: /my-field-pattern/i,
};
```

## Limitations

- Patterns are heuristic-based (may have false positives/negatives)
- Only regex matching, no deep config parsing
- Service catalog must have accurate field requirements
- No version tracking (drifts are point-in-time snapshots)

## Future Enhancements

- ML-based field detection
- Service-request payload integration (pull actual values from request)
- Reconciliation suggestions (link drifts to remediation engine)
- Drift timeline (tracking changes over time)
