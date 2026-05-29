# Collection Data Contract

**Version:** 1.0.0 (H1)  
**Status:** Normative for H2–H7 implementation

---

## 1. Enums

### 1.1 `CollectionSource`

```typescript
type CollectionSource =
  | "snmp"              // SNMP_FAST layer
  | "ssh_full_config"   // running-config snapshot
  | "ssh_detail"        // on-demand command
  | "manual_upload";    // uploaded config file, treated as ssh_full_config
```

**Mapping from legacy `DiscoverySource`:**

| Legacy | CollectionSource |
|--------|------------------|
| `snmp_snapshot` | `snmp` |
| `ssh_running_config`, `ssh_live` | `ssh_full_config` (if full text) or `ssh_detail` (if scoped command) |
| `manual_upload` | `manual_upload` |
| `local_db` | resolved to underlying snapshot's source |
| `netbox` | out of collection contract (inventory only) |

### 1.2 `CollectionScope`

```typescript
type CollectionScope =
  | "snmp_fast"
  | "full_config"
  | `detail:${DetailKind}`;

type DetailKind =
  | "bgp_peer"
  | "bgp_routes_received"
  | "bgp_routes_advertised"
  | "interface"
  | "interface_config"
  | "l2vc"
  | "vsi"
  | "mac_vlan"
  | "mac_vsi";
```

### 1.3 `FreshnessStatus`

```typescript
type FreshnessStatus = "fresh" | "stale" | "expired" | "unknown";
```

Computed: `now` vs `collected_at` and layer TTL (see architecture doc).

### 1.4 `CollectionRunStatus`

```typescript
type CollectionRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "partial"
  | "failed";
```

### 1.5 `DependencyResolutionStatus`

```typescript
type DependencyResolutionStatus = "FOUND" | "MISSING" | "UNKNOWN";
```

| Status | Meaning |
|--------|---------|
| FOUND | Catalog loaded; object present |
| MISSING | Catalog loaded; reference absent in config |
| UNKNOWN | Catalog empty/unparsed; cannot conclude |

**Rule:** UNKNOWN MUST NOT be promoted to FAIL for configurational policy dependencies.

---

## 2. Core records

### 2.1 `CollectionSnapshot`

```typescript
interface CollectionSnapshot {
  id: number;
  deviceId: number;
  source: CollectionSource;
  scope: CollectionScope;
  status: CollectionRunStatus;
  collectedAt: string;           // ISO8601
  freshnessExpiresAt: string | null;
  rawPayloadRef: RawPayloadRef;
  parsedPayload: ParsedPayload | null;
  parserVersion: string;
  collectionJobId: number | null;
  contentHash: string;
  errorSummary: string | null;
}

type RawPayloadRef =
  | { type: "inline"; text: string }
  | { type: "collected_config"; collectedConfigId: number }
  | { type: "evidence"; discoveryEvidenceId: number };
```

### 2.2 `CollectionJob`

```typescript
interface CollectionJob {
  id: number;
  deviceId: number;
  layer: "snmp_fast" | "ssh_full_config" | "ssh_detail";
  scope: CollectionScope;
  requestedBy: string;             // user id or "scheduler"
  status: CollectionRunStatus;
  startedAt: string;
  completedAt: string | null;
  commandsExecuted: string[];      // sanitized list
  snapshotId: number | null;
}
```

### 2.3 `Provenance` (embedded on all exposed facts)

```typescript
interface DataProvenance {
  source: CollectionSource;
  collectedAt: string;
  freshnessStatus: FreshnessStatus;
  collectionJobId: number | null;
  snapshotId: number | null;
  parserVersion: string | null;
}
```

---

## 3. Operational plane contracts

### 3.1 `OperationalInterface`

```typescript
interface OperationalInterface {
  deviceId: number;
  interfaceName: string;           // ifName preferred
  ifIndex: number | null;
  adminStatus: "up" | "down" | "testing" | "unknown";
  operStatus: "up" | "down" | "unknown";
  alias: string | null;
  speedBps: number | null;
  counters: {
    inOctets: string | null;       // bigint as string
    outOctets: string | null;
  } | null;
  provenance: DataProvenance;      // source MUST be snmp or ssh_detail
}
```

### 3.2 `OperationalBgpPeer`

```typescript
interface OperationalBgpPeer {
  deviceId: number;
  peerAddress: string;             // IP or IP:port normalized
  afiSafi: "ipv4_unicast" | "ipv6_unicast" | "unknown";
  peerState: string;               // established, idle, active, ...
  remoteAs: number | null;
  uptimeSeconds: number | null;
  acceptedPrefixes: number | null;
  receivedPrefixes: number | null;
  advertisedPrefixes: number | null;
  provenance: DataProvenance;
}
```

---

## 4. Configuration plane contracts

### 4.1 `ConfigBgpPeer`

```typescript
interface ConfigBgpPeer {
  deviceId: number;
  peerKey: string;                 // stable: peer IP or peer IP + vrf
  rootAsn: number | null;
  description: string | null;
  peerGroup: string | null;
  afiSafi: "ipv4_unicast" | "ipv6_unicast";
  enabled: boolean;
  importPolicy: string | null;
  exportPolicy: string | null;
  effectivePolicySource: "peer" | "peer_group" | "none";
  connectInterface: string | null;
  provenance: DataProvenance;      // source MUST be ssh_full_config | manual_upload
  snapshotId: number;
}
```

Aligns with `bgp-peer-dependency-parser` output (`BgpPeerModel`).

### 4.2 `PolicyDependencyCatalogs`

```typescript
interface PolicyDependencyCatalogs {
  deviceId: number;
  snapshotId: number;
  parserVersion: string;
  routePolicies: CatalogEntry[];
  ipPrefixes: CatalogEntry[];
  ipv6Prefixes: CatalogEntry[];
  communityFilters: CatalogEntry[];
  communityLists: CatalogEntry[];
  asPathFilters: CatalogEntry[];
  extCommunityFilters: CatalogEntry[];
  catalogStatus: Record<string, "loaded" | "empty" | "parse_error">;
}

interface CatalogEntry {
  name: string;
  normalizedName: string;
  entryCount: number;
  source: CollectionSource;
}
```

### 4.3 `ConfigInterface` (summary)

Full structured interface from config parser — fields: name, description, vrf, ipv4/ipv6 addresses, dot1q vlan, parentInterface, bindings (ospf, bgp, mpls, l2vc).  
`provenance.source` ∈ `{ ssh_full_config, manual_upload }`.

---

## 5. Detail plane contracts

### 5.1 `DetailRequest`

```typescript
interface DetailCollectionRequest {
  deviceId: number;
  kind: DetailKind;
  target: Record<string, string>;  // e.g. { peerIp: "172.28.1.138" }
  parentSnapshotId?: number;       // full-config snapshot for context
}
```

### 5.2 `DetailResult`

```typescript
interface DetailCollectionResult {
  snapshotId: number;
  sanitizedOutput: string;
  parsed: unknown;                 // kind-specific
  provenance: DataProvenance;
  auditEventId: string;
}
```

**Storage:** prefer `discovery_evidence` + lightweight `collection_snapshots` row (`scope=detail:*`).

---

## 6. Compliance finding extensions

Extend finding `metadata` / `evidence`:

```typescript
interface ComplianceFindingProvenance {
  plane: "operational" | "configurational";
  collectionSource: CollectionSource;
  configSnapshotId: number | null;
  operationalSnapshotId: number | null;
  collectedAt: string | null;
  freshnessStatus: FreshnessStatus;
  dependencyType?: "ip-prefix" | "ipv6-prefix" | "route-policy" | "community-filter" | ...;
  dependencyStatus?: DependencyResolutionStatus;
}
```

**Message templates:**

```
[config] FOUND ipv6-prefix GATEWAY-IPV6 via ssh_full_config snapshot #61 (2026-05-26)
[config] MISSING ip-prefix FOO via ssh_full_config snapshot #61
[config] UNKNOWN: ipv6_prefixes catalog unavailable (no raw_config)
[operational] Peer 10.0.0.1 Idle via snmp (stale, collected 2026-05-26T10:00:00Z)
```

---

## 7. API contracts (future)

| Method | Path | Layer |
|--------|------|-------|
| POST | `/api/devices/:id/collection/snmp-fast` | SNMP_FAST |
| POST | `/api/devices/:id/collection/full-config` | SSH_FULL_CONFIG |
| POST | `/api/devices/:id/collection/detail` | SSH_DETAIL |
| GET | `/api/devices/:id/collection/freshness` | summary |
| GET | `/api/devices/:id/operational/interfaces` | read operational_* |
| GET | `/api/devices/:id/operational/bgp-peers` | read operational_* |
| GET | `/api/devices/:id/config/snapshot/latest` | latest full-config |

**H1:** document only; no implementation required.

Existing endpoints remain until deprecation window:

- `POST /api/devices/:id/discover` → eventually splits into fast/full schedules
- `POST /api/netops/devices/:id/collect/read-only` → maps to SNMP_FAST
- `GET /api/devices/:id/collected-config` → maps to latest SSH_FULL_CONFIG

---

## 8. Parser contract

### 8.1 Input

```typescript
interface ParserInput {
  configText: string;
  source: CollectionSource;
  vendor: "huawei-vrp" | string;
  parserVersion: string;
}
```

### 8.2 Output

```typescript
interface ParserOutput {
  catalogs: PolicyDependencyCatalogs;
  bgpPeerModel: BgpPeerModel;
  interfaces: ConfigInterface[];
  l2: L2Structures;
  warnings: string[];
}
```

### 8.3 Idempotence

Same `contentHash` + `parserVersion` → skip re-parse; reuse `parsed_payload`.

---

## 9. Validation rules (implementers)

1. UI MUST NOT show configurational MISSING without `configSnapshotId` and `catalogStatus.loaded`.
2. Compliance engine MUST call parser with `rawConfig` when `collected_configs` row exists.
3. SNMP-only device page MUST show operational data with `unknown` config freshness if no full-config.
4. Detail endpoints MUST validate command template + target params before SSH.
5. `freshness_status=expired` → compliance re-run allowed but findings tagged `stale` at collection level.

---

## 10. Versioning

| Artifact | Field |
|----------|-------|
| Snapshot | `parser_version` |
| Finding | `metadata.parserVersion`, `metadata.complianceEngineVersion` |
| Contract | this doc semver in `COLLECTION_CONTRACT_VERSION` env (H4+) |

Breaking parser changes bump minor `parser_version`; old snapshots remain readable with compatibility shims.
