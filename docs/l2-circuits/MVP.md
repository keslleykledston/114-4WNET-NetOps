# L2 Circuits Discovery MVP

## Overview

Module for read-only discovery of Layer 2 circuits on Huawei VRP devices. Discovers MPLS L2VC, VSI/VPLS, VLANs, and subinterface configurations via SSH. Provides normalized status classification, finding detection, and RESTful API for querying results.

## Scope

**In scope (MVP):**
- SSH read-only discovery from Huawei VRP devices
- MPLS L2VC (Pseudowire)
- VSI/VPLS (Virtual Service Instance / VPLS)
- VLAN and Q-in-Q (dot1q subinterface)
- Async job-based discovery with polling
- Status normalization (UP, DOWN, PARTIAL, UNKNOWN, CONFIG_ONLY)
- Automatic finding detection (5 finding types)
- RESTful API with filtering and pagination

**Out of scope (future phases):**
- SNMP discovery
- NetBox integration / write-back
- Cisco, Juniper, Arista, Nokia
- Real-time streaming updates
- Active monitoring (heartbeat, OAM checks)

## Read-Only Commands

All commands are **display** (read-only). No `system-view`, no configuration changes, no device alterations.

```
display mpls l2vc verbose
display vsi verbose
display vsi <VSI_NAME> verbose
display interface brief
display interface description
display mac-address vsi
display mac-address vsi <VSI_NAME>
display mac-address vlan
display mac-address vlan <VLAN_ID>
display current-configuration interface <INTERFACE>
```

**Safety:**
- Blocked tokens: `system-view`, `configure terminal`, `commit`, `save`, `undo`, `reset`, `clear bgp`, `refresh bgp`
- All commands validated against allowlist before SSH execution
- SSH outputs sanitized (passwords redacted) before persistence

## Circuit Types

| Type | Source Command | Example | Use Case |
|------|----------------|---------|----------|
| `l2vc` | `display mpls l2vc verbose` | VC-ID 1001 to peer 192.168.1.2 | Pseudowire, point-to-point L2VC |
| `vpws` | `display mpls l2vc verbose` (etype=Ethernet VLAN) | VC-ID 2001, Outer VLAN 100, Inner VLAN 200 | MPLS L2VC with VLAN tagging |
| `vsi` | `display vsi verbose` | VSI-VPLS-1, BD-100, peer 192.168.1.2 | VPLS service instance, multipoint |
| `vlan` | `display current-configuration interface` | VLAN 100, 1000 MACs | Access VLAN on interface |
| `dot1q_subif` | `display interface brief` + `display current-configuration interface` | Gi0/0/3.100, outer 100, inner 200 | Q-in-Q subinterface |

## Status Normalization

### Admin Status
- Input: `up`, `enable` → Normalized: `UP`
- Input: `down`, `disable`, `admin-down` → Normalized: `DOWN`
- Input: (missing) → Normalized: `UNKNOWN`

### Operational Status
- Input: `up`, `active` → Normalized: `UP`
- Input: `down`, `inactive` → Normalized: `DOWN`
- Input: (missing but admin=UP) → Normalized: `CONFIG_ONLY`
- Input: (missing) → Normalized: `UNKNOWN`

### Compound Status

Final status logic:
| Admin | Oper | PW Status | Final Status | Meaning |
|-------|------|-----------|--------------|---------|
| UP | UP | UP | UP | Fully operational |
| UP | DOWN | - | DOWN | Operationally down but admin enabled (alert) |
| UP | UP | DOWN | PARTIAL | Circuit exists but PW status unknown/down |
| DOWN | DOWN | - | DOWN | Administratively shutdown |
| - | - | - | UNKNOWN | Insufficient data |
| UP | (missing) | - | CONFIG_ONLY | Configured but no oper status available (not checked) |

## Findings

### CIRCUIT_DOWN
**Severity:** ERROR  
**Condition:** `admin_status == UP AND oper_status == DOWN`  
**Meaning:** Circuit is enabled but not passing traffic.  
**Action:** Investigate peer connectivity, PW status, interface physical status.

### INCOMPLETE_L2_CONFIG
**Severity:** WARNING  
**Condition:** L2VC missing VC ID, VSI missing VSI name, or any L2VC/VPWS missing peer IP.  
**Meaning:** Configuration is incomplete or parser failed.  
**Action:** Verify manual, check parser logs.

### DUPLICATED_VC_ID
**Severity:** ERROR  
**Condition:** Same VC ID appears in multiple discovered circuits.  
**Meaning:** Configuration error or stale discovery data.  
**Action:** Verify with `show mpls l2vc id <VC>`, confirm no duplicate configs.

### VLAN_CONFLICT
**Severity:** WARNING  
**Condition:** Same (outer_vlan, inner_vlan) pair appears in multiple circuits.  
**Meaning:** Potential VLAN reuse/conflict.  
**Action:** Verify VLAN assignment, check for unintended overlaps.

### DESCRIPTION_MISSING
**Severity:** INFO  
**Condition:** `description` field is null, empty, or "(null)".  
**Meaning:** Circuit lacks operational documentation.  
**Action:** Optional; add descriptions for operational clarity.

## API Endpoints

### 1. Start Discovery (Async Job)
```
POST /api/l2-circuits/discover
Content-Type: application/json

{
  "device_id": 1
}

Response (HTTP 202 Accepted):
{
  "run_id": "disc-l2-1-1234567890123",
  "device_id": 1,
  "status": "running",
  "started_at": "2026-05-23T10:00:00.000Z"
}
```

SSH collection, parsing, and DB upsert happen **asynchronously**. Client polls status via `GET /api/l2-circuits/discovery-jobs/:runId`.

### 2. Poll Discovery Job
```
GET /api/l2-circuits/discovery-jobs/disc-l2-1-1234567890123

Response (HTTP 200):
{
  "run_id": "disc-l2-1-1234567890123",
  "device_id": 1,
  "status": "completed",
  "started_at": "2026-05-23T10:00:00.000Z",
  "finished_at": "2026-05-23T10:00:15.000Z",
  "circuit_count": 8,
  "findings_count": 2,
  "error_message": null,
  "circuits": [ ... ]  // Populated when status == "completed"
}

Status values:
- "pending" — waiting to start
- "running" — in progress
- "completed" — done, circuits available
- "failed" — error, check error_message
```

### 3. List Circuits (with filters)
```
GET /api/l2-circuits?device_id=1&circuit_type=l2vc&status=DOWN

Response (HTTP 200):
{
  "circuits": [
    {
      "id": 42,
      "device_id": 1,
      "circuit_type": "l2vc",
      "name": "L2VC-1001",
      "vc_id": "1001",
      "local_interface": "Gi0/0/1",
      "peer_ip": "192.168.1.2",
      "admin_status": "UP",
      "oper_status": "DOWN",
      "pw_status": "DOWN",
      "description": "L2VC-Peer1-Site2",
      "findings": [
        {
          "code": "CIRCUIT_DOWN",
          "severity": "error",
          "message": "Circuit L2VC-1001 is administratively up but operationally down"
        }
      ],
      "raw_evidence": "VC ID            : 1001\nVC Type ...",
      "first_seen": "2026-05-23T10:00:00.000Z",
      "last_seen": "2026-05-23T10:00:15.000Z",
      "discovery_run_id": "disc-l2-1-1234567890123"
    }
  ],
  "total": 1
}

Query params (all optional):
- device_id=N — filter by device
- circuit_type=<vlan|dot1q_subif|l2vc|vpws|vsi|vpls> — filter by type
- status=<UP|DOWN|PARTIAL|UNKNOWN|CONFIG_ONLY> — filter by current status
- vc_id=<ID> — exact match on VC ID (for l2vc/vpws)
- vsi_name=<NAME> — exact match on VSI name (for vsi)
```

### 4. Get Single Circuit
```
GET /api/l2-circuits/42

Response (HTTP 200):
{
  "id": 42,
  "device_id": 1,
  ...same as list item...
}

Response (HTTP 404): { "error": "Circuit not found" }
```

## Data Model

### L2Circuit (DB table: `l2_circuits`)

```typescript
{
  id: number;
  device_id: number;
  circuit_type: "vlan" | "dot1q_subif" | "l2vc" | "vpws" | "vsi" | "vpls";
  service_id?: string;
  name: string; // e.g., "L2VC-1001", "VSI-VPLS-1"
  description?: string;
  outer_vlan?: number; // VLAN ID or BD ID
  inner_vlan?: number; // for Q-in-Q
  vc_id?: string; // for l2vc/vpws
  vsi_name?: string; // for vsi
  vsi_id?: string; // for vsi
  local_interface?: string;
  parent_interface?: string; // for subinterface
  peer_ip?: string;
  admin_status: "UP" | "DOWN" | "UNKNOWN";
  oper_status: "UP" | "DOWN" | "PARTIAL" | "UNKNOWN" | "CONFIG_ONLY";
  pw_status?: string; // PW-specific status
  mac_count?: number;
  source: "ssh_live" | "cached_config";
  raw_evidence?: string; // evidence line, ≤240 chars
  findings: Array<{ code: string; severity: "info" | "warning" | "error"; message: string }>;
  first_seen: Date;
  last_seen: Date;
  discovery_run_id: string; // links to discovery job
  created_at: Date;
  updated_at: Date;
}
```

### L2DiscoveryJob (DB table: `l2_discovery_jobs`)

```typescript
{
  id: number;
  run_id: string; // unique identifier, format: "disc-l2-{device_id}-{timestamp}"
  device_id: number;
  status: "pending" | "running" | "completed" | "failed";
  started_at: Date;
  finished_at?: Date;
  circuit_count?: number;
  findings_count?: number;
  error_message?: string;
  created_at: Date;
}
```

## Circuit Discovery Workflow (Backend)

1. **Request received:** `POST /api/l2-circuits/discover { device_id: 1 }`
2. **Create job record** in `l2_discovery_jobs` with status="running", runId="disc-l2-1-timestamp"
3. **Return HTTP 202** immediately with job info
4. **Background: SSH Collect**
   - Resolve device credentials from DB
   - SSH to device.hostname:22
   - Execute read-only commands (with timeouts, allowlist validation)
   - Collect outputs: display mpls l2vc verbose, display vsi verbose, display interface brief, etc.
5. **Background: Parse**
   - Parse outputs with state machine (huawei-vrp-l2.ts)
   - Extract VC ID, VSI name, VLAN, interface, peer IP, status, etc.
   - Each parsed circuit includes rawEvidence snippet
6. **Background: Normalize**
   - Map admin_status (up/down/unknown) to L2Status
   - Map oper_status similarly
   - Compound: (admin=UP + oper=DOWN) → status=DOWN (alert)
7. **Background: Resolve Findings**
   - Scan all circuits for CIRCUIT_DOWN, INCOMPLETE_L2_CONFIG, DUPLICATED_VC_ID, VLAN_CONFLICT, DESCRIPTION_MISSING
   - Attach findings array to each circuit
8. **Background: Upsert to DB**
   - For each circuit, INSERT into l2_circuits with all normalized data
   - Use CONFLICT handling to update lastSeen if circuit exists
9. **Background: Update Job**
   - Update l2_discovery_jobs: status="completed", finished_at=now, circuit_count, findings_count
10. **Client polls:** `GET /api/l2-circuits/discovery-jobs/disc-l2-1-timestamp` until status != "running"
11. **Retrieve circuits:** `GET /api/l2-circuits?device_id=1`

## Limitations

### Current MVP
- **Huawei VRP only** — no Cisco, Juniper, Arista, Nokia in v0.1
- **SSH only** — SNMP discovery planned for future phase
- **Read-only** — zero writes to device, zero config changes
- **No NetBox write** — discovery data stays in local DB; manual NetBox sync TBD
- **Static credentials** — uses device.hostname + hardcoded admin/password from request context (improve later)
- **Async discovery only** — no synchronous blocking discovery (by design)
- **No bulk discovery** — one device at a time (multi-device discovery is background job)

### Known Gaps (Design, Not Bugs)
- **No MAC aging tracking** — mac_count is snapshot, not historical
- **No OAM/BFD status** — uses PW status as proxy (not direct OAM)
- **No peer validation** — peer_ip stored but not verified to be reachable
- **No bandwidth/QoS mapping** — circuit speed, policer configs not captured (future: QoS analyzer module)

## Testing

### Manual Testing with Fixtures

Fixtures in `src/modules/l2circuits/parsers/__fixtures__/`:

```bash
# Test parser directly (example: Node REPL or unit test)
import { parseHuaweiL2Circuits } from "./parsers/huawei-vrp-l2.js";
import fs from "fs";

const mpls = fs.readFileSync("__fixtures__/display-mpls-l2vc-verbose.txt", "utf-8");
const vsi = fs.readFileSync("__fixtures__/display-vsi-verbose.txt", "utf-8");

const parsed = parseHuaweiL2Circuits({
  "display mpls l2vc verbose": mpls,
  "display vsi verbose": vsi,
});

console.log(parsed);
// Expected: 5 circuits (3 l2vc, 2 vsi) with all fields populated
```

### API Integration Test (curl)

```bash
# 1. Start discovery
curl -X POST http://localhost:3000/api/l2-circuits/discover \
  -H "Content-Type: application/json" \
  -d '{"device_id": 1}' \
  -w "\nStatus: %{http_code}\n"

# Response: HTTP 202
# {
#   "run_id": "disc-l2-1-1234567890123",
#   "status": "running",
#   "started_at": "..."
# }

# 2. Poll job status (repeat every 2-5 seconds)
curl http://localhost:3000/api/l2-circuits/discovery-jobs/disc-l2-1-1234567890123

# Response (while running):
# { "run_id": "...", "status": "running", ... }

# Response (after completion):
# { "run_id": "...", "status": "completed", "circuit_count": 8, ... }

# 3. List circuits
curl 'http://localhost:3000/api/l2-circuits?device_id=1&status=DOWN'

# 4. Get single circuit
curl http://localhost:3000/api/l2-circuits/42
```

## Monitoring & Observability

### Logs
- SSH command execution logged (redacted outputs)
- Parser warnings for unrecognized line formats
- Job status transitions logged to stdout

### Metrics (TBD for future)
- Discovery duration (start → completion)
- Circuits discovered per device
- Finding distribution (CIRCUIT_DOWN vs INCOMPLETE_L2_CONFIG, etc.)
- SSH timeout/error rate

### Database Queries for Ops
```sql
-- Circuits with findings
SELECT id, name, circuit_type, admin_status, oper_status, findings
FROM l2_circuits WHERE findings != '[]' ORDER BY created_at DESC;

-- Circuits down by device
SELECT device_id, COUNT(*) as down_count
FROM l2_circuits WHERE oper_status = 'DOWN' GROUP BY device_id;

-- Last discovery per device
SELECT DISTINCT ON (device_id) device_id, run_id, status, finished_at
FROM l2_discovery_jobs WHERE status = 'completed' ORDER BY device_id, finished_at DESC;
```

## Future Enhancements

1. **Multi-device discovery** — async job queue for bulk discovery
2. **SNMP fallback** — add SNMP collector when SSH fails
3. **NetBox sync** — auto-export circuits to NetBox DCIM
4. **Cisco IOS-XE/XR** — add parsers for Cisco command output
5. **Real-time streaming** — WebSocket push updates during discovery
6. **OAM integration** — check BFD/CFM status for circuit health
7. **Bandwidth tracking** — monitor QoS policer rates, detect oversub
8. **Circuit lifecycle tracking** — historical changes, audit trail per circuit
