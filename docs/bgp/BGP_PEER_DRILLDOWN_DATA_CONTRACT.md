# BGP Peer Drilldown — Data Contract

**Version:** `bgp-peer-drilldown-v1`  
**Status:** normative for BGP-D2+ API  
**Phase:** BGP-D1 (contract only — no implementation)

---

## 1. Envelope — `BgpPeerDrilldownResult`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `deviceId` | integer | yes | NetOps device id |
| `peer` | string | yes | Peer address (IPv4 or IPv6 normalized) |
| `source` | enum | yes | How result was built (see §2) |
| `collectedAt` | ISO8601 | yes | Primary config snapshot time |
| `configBuildSource` | enum | yes | `raw_config` \| `parsed_config_cache` \| `snapshot_aggregate` \| `unknown` |
| `root` | `BgpPeerRootConfig` | yes | BGP root peer block |
| `families` | `BgpPeerFamilyConfig[]` | yes | Per address-family / VRF |
| `effectivePolicies` | `BgpPeerEffectivePolicy[]` | yes | Resolved import/export per family (after group inheritance) |
| `policies` | `BgpPeerRoutePolicyDrilldown[]` | yes | Full route-policy drilldown |
| `dependencies` | `BgpPeerDependencyEdge[]` | yes | Flattened dependency graph edges |
| `runtime` | `BgpPeerRuntimeStatus` \| null | no | Operational state (SNMP / SSH detail) |
| `routeTables` | `BgpPeerRouteTableSummary` | yes | received/accepted/advertised slots (D5) |
| `warnings` | string[] | yes | Non-fatal issues |
| `rawEvidenceRefs` | `RawEvidenceRef[]` | yes | Pointers to sanitized evidence rows |

---

## 2. Enums

### `DrilldownSource`

```typescript
type DrilldownSource =
  | "snmp"              // runtime only
  | "ssh_full_config"   // from raw_config / full-config snapshot
  | "ssh_detail"        // on-demand commands
  | "mixed"             // combined layers
  | "local_db";         // cached DB only, no live collect
```

### `ConfigBuildSource`

Same semantics as policy dependency pipeline:

| Value | Meaning |
|-------|---------|
| `raw_config` | Parsed from `collected_configs.raw_config` or equivalent |
| `parsed_config_cache` | Embedded snapshot cache only (fallback) |
| `snapshot_aggregate` | Built from snapshot arrays without full parse |
| `unknown` | No config evidence |

### `DependencyStatus`

```typescript
type DependencyStatus = "FOUND" | "MISSING" | "UNKNOWN";
```

| Status | Rule |
|--------|------|
| FOUND | Catalog loaded; object exists |
| MISSING | Catalog loaded; reference absent in config |
| UNKNOWN | Catalog empty/unparsed — **never map to compliance FAIL** |

### `DependencyType`

```typescript
type DependencyType =
  | "ip-prefix"
  | "ipv6-prefix"
  | "community-filter"
  | "community-list"
  | "as-path-filter"
  | "extcommunity-filter"
  | "route-policy"
  | "acl";
```

---

## 3. `BgpPeerRootConfig`

```json
{
  "peer": "172.28.1.138",
  "asNumber": 262663,
  "description": "WIFIZAO.BRT",
  "group": null,
  "connectInterface": null,
  "timers": { "hold": null, "keepalive": null },
  "passwordPresent": false,
  "source": "ssh_full_config",
  "status": "FOUND"
}
```

| Field | Notes |
|-------|-------|
| `passwordPresent` | boolean only — **never** return secret value |
| `status` | `FOUND` if peer block located in config; `MISSING` if peer not in config |

---

## 4. `BgpPeerFamilyConfig`

```json
{
  "afiSafi": "ipv4_unicast",
  "vrf": null,
  "enabled": true,
  "importPolicy": "AS262663-WIFIZAO.BRT-Import-IPv4",
  "exportPolicy": "AS262663-WIFIZAO.BRT-Export-IPv4",
  "defaultRouteAdvertise": true,
  "nextHopLocal": false,
  "advertiseCommunity": false,
  "advertiseExtCommunity": false,
  "reflectClient": false,
  "keepAllRoutes": null,
  "filterPolicy": null,
  "asPathFilter": null,
  "ipPrefixFilter": null,
  "inheritedFromGroup": false,
  "inheritedGroup": null,
  "effectivePolicySource": "peer",
  "source": "ssh_full_config"
}
```

`afiSafi` values: `ipv4_unicast` | `ipv6_unicast` | `vpnv4` | `vpnv6` | `ipv4_vpn_instance` | `ipv6_vpn_instance`.

`effectivePolicySource`: `peer` | `peer_group` | `none`.

---

## 5. `BgpPeerEffectivePolicy`

Resolved policy name per direction after peer-group inheritance (what the device effectively applies).

```json
{
  "afiSafi": "ipv4_unicast",
  "vrf": null,
  "direction": "import",
  "policyName": "AS262663-WIFIZAO.BRT-Import-IPv4",
  "source": "peer",
  "inheritedFromGroup": false,
  "status": "FOUND"
}
```

`direction`: `import` | `export`.

`status`: `FOUND` | `MISSING` | `UNKNOWN` (policy name referenced but route-policy object not in catalog).

---

## 6. `BgpPeerRoutePolicyDrilldown`

```json
{
  "name": "AS262663-WIFIZAO.BRT-Import-IPv4",
  "direction": "import",
  "afiSafi": "ipv4_unicast",
  "nodes": [
    {
      "sequence": 10,
      "action": "permit",
      "matches": [
        {
          "type": "ip-prefix",
          "name": "AS262663-WIFIZAO",
          "raw": "if-match ip-prefix AS262663-WIFIZAO"
        }
      ],
      "applies": [
        {
          "type": "community",
          "raw": "apply community CUST-EXPORT additive"
        }
      ],
      "control": []
    }
  ],
  "dependencies": []
}
```

Node `control`: `goto next-node`, `continue`, etc.

---

## 7. `BgpPeerDependencyEdge`

Flattened edges for tree UI and API filters.

```json
{
  "fromType": "route-policy",
  "fromName": "AS262663-WIFIZAO.BRT-Import-IPv4",
  "fromNode": 10,
  "dependencyType": "ip-prefix",
  "dependencyName": "AS262663-WIFIZAO",
  "status": "FOUND",
  "evidence": "Route-policy AS262663-WIFIZAO.BRT-Import-IPv4 node 10 references ip-prefix AS262663-WIFIZAO — FOUND via ssh_full_config.",
  "source": "ssh_full_config"
}
```

---

## 8. `BgpPeerRuntimeStatus`

```json
{
  "state": "established",
  "remoteAs": 262663,
  "uptime": "3d02h15m",
  "localRouterId": "10.0.0.1",
  "remoteRouterId": "10.0.0.2",
  "receivedPrefixes": 42,
  "acceptedPrefixes": 40,
  "advertisedPrefixes": 1200,
  "receivingPolicy": null,
  "sendingPolicy": null,
  "keepAllRoutes": false,
  "source": "snmp",
  "collectedAt": "2026-05-26T12:00:00.000Z",
  "freshness": "fresh"
}
```

SNMP may omit policy names; verbose SSH may populate `receivingPolicy` / `sendingPolicy`.

---

## 9. `BgpPeerRouteTableSummary`

Default for D2/D3 — all `requested: false`.

```json
{
  "received": {
    "requested": false,
    "available": false,
    "prefixCount": null,
    "warning": "keep-all-routes not enabled; received-routes unavailable"
  },
  "accepted": { "requested": false, "available": false, "prefixCount": null },
  "advertised": { "requested": false, "available": false, "prefixCount": null }
}
```

---

## 10. `RawEvidenceRef`

```json
{
  "id": 12345,
  "source": "ssh_full_config",
  "commandOrScope": "collected_configs.raw_config",
  "collectedAt": "2026-05-26T10:00:00.000Z"
}
```

Never include secrets in evidence payloads returned to UI.

---

## 11. Full example — WIFIZAO peer

See `BGP_PEER_DRILLDOWN_ARCHITECTURE.md` for narrative; minimal valid D2 response shape:

```json
{
  "deviceId": 1,
  "peer": "172.28.1.138",
  "source": "ssh_full_config",
  "collectedAt": "2026-05-26T10:00:00.000Z",
  "configBuildSource": "raw_config",
  "root": {
    "peer": "172.28.1.138",
    "asNumber": 262663,
    "description": "WIFIZAO.BRT",
    "group": null,
    "connectInterface": null,
    "timers": null,
    "passwordPresent": false,
    "source": "ssh_full_config",
    "status": "FOUND"
  },
  "families": [
    {
      "afiSafi": "ipv4_unicast",
      "vrf": null,
      "enabled": true,
      "importPolicy": "AS262663-WIFIZAO.BRT-Import-IPv4",
      "exportPolicy": "AS262663-WIFIZAO.BRT-Export-IPv4",
      "defaultRouteAdvertise": true,
      "nextHopLocal": false,
      "advertiseCommunity": false,
      "advertiseExtCommunity": false,
      "reflectClient": false,
      "keepAllRoutes": null,
      "filterPolicy": null,
      "asPathFilter": null,
      "ipPrefixFilter": null,
      "inheritedFromGroup": false,
      "inheritedGroup": null,
      "effectivePolicySource": "peer",
      "source": "ssh_full_config"
    }
  ],
  "effectivePolicies": [
    {
      "afiSafi": "ipv4_unicast",
      "vrf": null,
      "direction": "import",
      "policyName": "AS262663-WIFIZAO.BRT-Import-IPv4",
      "source": "peer",
      "inheritedFromGroup": false,
      "status": "FOUND"
    },
    {
      "afiSafi": "ipv4_unicast",
      "vrf": null,
      "direction": "export",
      "policyName": "AS262663-WIFIZAO.BRT-Export-IPv4",
      "source": "peer",
      "inheritedFromGroup": false,
      "status": "FOUND"
    }
  ],
  "policies": [],
  "dependencies": [],
  "runtime": null,
  "routeTables": {
    "received": { "requested": false, "available": false, "prefixCount": null },
    "accepted": { "requested": false, "available": false, "prefixCount": null },
    "advertised": { "requested": false, "available": false, "prefixCount": null }
  },
  "warnings": [],
  "rawEvidenceRefs": []
}
```

---

## 12. API mapping (BGP-D2+)

```http
GET /api/bgp/peers/:deviceId/:peerIp/drilldown
```

Response body: `BgpPeerDrilldownResult`.

Query params documented in architecture doc; D2 defaults: `include_routes=false`, `source=snapshot`.

---

## 13. Validation rules

1. `configBuildSource` MUST be `raw_config` when `collected_configs.raw_config` was parsed.
2. `dependencies[].status` MUST NOT be `MISSING` when catalog for that type is `UNKNOWN`.
3. `root.passwordPresent` MAY be true; password value MUST NOT appear in JSON.
4. `routeTables.*.requested` MUST be false unless D5 confirmation token validated.
5. Compliance findings MUST NOT be auto-generated from drilldown UNKNOWN states.

---

## 14. Versioning

Breaking changes bump `bgp-peer-drilldown-v2`. Clients send `Accept-Version` or query `contractVersion=v1`.
