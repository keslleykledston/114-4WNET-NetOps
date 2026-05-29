# L2 Circuits Discovery MVP

## Validation status (FASE 1.7 — 2026-05-23)

**MVP CLOSED — GO for controlled NOC use** (SSH off by default).

| Device | ID | Profile | Live result |
|--------|-----|---------|-------------|
| `4WNET-BVA-BRT-RX` | 1 | NE/VRP dot1q, VE | 131 `vlan_local` |
| `4WNET-BVA-BRT-A_S6730-H48X6C` | 2 (`4WNET-BVA-BRT-RA`) | S6730 L2VC/VSI | 130 (82 L2VC/VPWS + 48 VSI) |

**Ops docs:** `RUNBOOK_L2_DISCOVERY.md`, `SAFE_EXECUTION_CHECKLIST.md`, `SUPPORTED_SCENARIOS.md`  
**Closure report:** `reports/l2-circuits/MVP_L2_DISCOVERY_CLOSURE_REPORT.md`

**Flag:** `L2_DISCOVER_SSH_ENABLED=false` (default). Enable only per runbook + mandatory rollback.

---

## Overview

Module for read-only discovery of Layer 2 circuits on Huawei VRP devices. Discovers MPLS L2VC, VSI/VPLS, VLANs, and subinterface configurations via SSH. Provides normalized status classification, finding detection, and RESTful API for querying results.

## Scope

**In scope (MVP — validated):**
- SSH read-only discovery from Huawei VRP devices (NE edge + S6730 switch)
- MPLS L2VC / VPWS (NE8000 verbose + S6730 `display mpls l2vc`)
- VSI/VPLS (NE8000 + S6730 `Peer Router ID` format)
- VLAN local dot1q subinterfaces (`vlan_local`) + VE/ve-group
- Async job-based discovery with polling
- Status normalization (UP, DOWN, PARTIAL, UNKNOWN, CONFIG_ONLY)
- Finding detection (6 finding types)
- RESTful API with filtering and pagination

**Out of scope (future phases):**
- SNMP discovery
- NetBox integration / write-back
- Cisco, Juniper, Arista, Nokia
- Real-time streaming updates
- Active monitoring (heartbeat, OAM checks)

## Read-Only Commands (L2 collector — 6 commands)

All commands are **display** (read-only). Validated via allowlist before SSH.

```
display mpls l2vc verbose      # NE8000-style L2VC
display mpls l2vc              # S6730-style L2VC (fallback)
display vsi verbose            # VSI NE8000 + S6730
display interface brief
display interface description  # dot1q status merge
display current-configuration interface  # dot1q / VE / ve-group
```

Also allowlisted (not in default L2 collector): `display mac-address vlan <VLAN_ID>`, `display mac-address vsi <VSI_NAME>` — **not dynamically collected in MVP**.

**Safety:**
- Blocked tokens: `system-view`, `configure terminal`, `commit`, `save`, `undo`, `reset`, `clear bgp`, `refresh bgp`
- All commands validated against allowlist before SSH execution
- SSH outputs sanitized (passwords redacted) before persistence

## Circuit Types

| Type | Source Command | Example | Validated |
|------|----------------|---------|-----------|
| `vlan_local` | `display current-configuration interface` + `display interface description` | Eth-Trunk0.77, VLAN 77 | device 1 live |
| `l2vc` | `display mpls l2vc verbose` or `display mpls l2vc` | VC-ID 1001 | fixture / S6730 |
| `vpws` | `display mpls l2vc` (VC type VLAN) | VC 15, Vlanif15 | device 2 live |
| `vsi` | `display vsi verbose` | SERVICOS_CDS, peer 10.200.4.1 | device 2 live |
| `vpls` | `display vsi verbose` | encapsulation vlan | parser support |
| `vlan` | legacy | — | use `vlan_local` |
| `dot1q_subif` | legacy alias | — | use `vlan_local` |

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
**Condition:** `oper_status == DOWN`  
**Meaning:** Circuit not passing traffic operationally.  
**Action:** Investigate peer connectivity, PW status, interface physical status.

### REMOTE_NOT_FORWARDING
**Severity:** WARNING  
**Condition:** L2VC/VPWS with `remote forwarding state = not forwarding` (S6730).  
**Meaning:** Local tunnel/session may be up but remote PW not forwarding.  
**Action:** Check peer device, PW status code, remote AC.

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
**Condition:** `description` null/empty — **skipped** for `l2vc`, `vpws`, `vsi`, `vpls` (no description in CLI).  
**Meaning:** Circuit lacks operational documentation (mainly `vlan_local`).  
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
- circuit_type=<vlan|vlan_local|dot1q_subif|l2vc|vpws|vsi|vpls> — filter by type
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
  circuit_type: "vlan" | "vlan_local" | "dot1q_subif" | "l2vc" | "vpws" | "vsi" | "vpls";
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
4. **Background: SSH Collect** (only if `L2_DISCOVER_SSH_ENABLED=true`)
   - Resolve device credentials from DB (encrypted password + SESSION_SECRET)
   - SSH to device IP:22
   - Execute 6 read-only L2 commands (allowlist validation)
5. **Background: Parse**
   - `huawei-vrp-l2.ts` — NE8000 L2VC/VSI verbose
   - `dot1q-local.parser.ts` — vlan_local from config + interface description
   - `s6730-l2.parser.ts` — S6730 `display mpls l2vc` + VSI dialect
6. **Background: Normalize**
7. **Background: Resolve Findings**
   - CIRCUIT_DOWN, REMOTE_NOT_FORWARDING, INCOMPLETE_L2_CONFIG, DUPLICATED_VC_ID, VLAN_CONFLICT, DESCRIPTION_MISSING
8. **Background: Insert to DB** (per discovery run)
9. **Background: Update Job**
   - Update l2_discovery_jobs: status="completed", finished_at=now, circuit_count, findings_count
10. **Client polls:** `GET /api/l2-circuits/discovery-jobs/disc-l2-1-timestamp` until status != "running"
11. **Retrieve circuits:** `GET /api/l2-circuits?device_id=1`

## Limitations

### Current MVP (validated + known gaps)

- **Huawei VRP only** — NE edge (dot1q) + S6730 (L2VC/VSI) validated live
- **SSH only** — gated by `L2_DISCOVER_SSH_ENABLED` (default false)
- **Read-only** — zero writes to device
- **No NetBox write** — local DB only
- **Encrypted credentials** — `password_encrypted` + `SESSION_SECRET`
- **One device per discover job** — no bulk validation
- **MAC not dynamic** — `display mac-address vlan/vsi` requires parameter; not in collector
- **SNMP** — not implemented
- **Device 2 naming** — NetOps `BRT-RA` vs CLI `BRT-A_S6730-H48X6C` (cosmetic rename optional)

### Known Gaps (Design, Not Bugs)
- **No MAC aging tracking** — mac_count is snapshot, not historical
- **No OAM/BFD status** — uses PW status as proxy (not direct OAM)
- **No peer validation** — peer_ip stored but not verified to be reachable
- **No bandwidth/QoS mapping** — circuit speed, policer configs not captured (future: QoS analyzer module)

## Testing

### Manual Testing with Fixtures

Fixtures and selftests:

```bash
node tools/l2-dot1q-parser-selftest.mjs      # device 1 fixture: 131 vlan_local
node tools/l2-s6730-parser-selftest.mjs      # S6730 fixture + regression
node tools/l2-collector-selftest.mjs         # 6 commands allowlisted
```

Fixtures paths:
- `__fixtures__/manual-device-1/` — BRT-RX dot1q
- `__fixtures__/manual-s6730-brt-a/` — S6730 L2VC/VSI sample
- `parsers/__fixtures__/` — NE8000 synthetic L2VC/VSI

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
