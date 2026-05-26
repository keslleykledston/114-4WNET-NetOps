# PHASE BGP Peer Drilldown D5B - Cache Runtime Smoke

**Date:** 2026-05-26
**Base commit:** `b8ee973 feat(bgp): cache peer drilldown snapshots and history`
**Status:** GO

## Scope

Validate D5 cache/history at runtime after applying DB schema.

Safety boundaries kept:

- no SSH execution
- no SNMP execution
- no discovery
- no feature flag enablement
- no device changes
- no NetBox changes

## Migration

Command:

```bash
docker compose run --rm --build migrate
```

Result:

```text
drizzle-kit push --config ./drizzle.config.ts
[✓] Changes applied
```

Table validation:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name='bgp_peer_drilldown_snapshots'
ORDER BY ordinal_position;
```

Observed columns:

```text
id                  integer
device_id           integer
peer                text
source              text
config_build_source text
peer_hash           text
collected_at        timestamp without time zone
expires_at          timestamp without time zone
snapshot_json       jsonb
runtime_json        jsonb
warnings            jsonb
created_at          timestamp without time zone
```

## Runtime

API/web rebuilt with temporary compose override:

```text
SNMP_POLL_ENABLED=false
BGP_DRILLDOWN_SSH_DETAIL_ENABLED=false
```

Container env confirmed:

```text
SNMP_POLL_ENABLED=false
BGP_DRILLDOWN_SSH_DETAIL_ENABLED=false
```

Containers:

```text
netops-api healthy 0.0.0.0:8085->8080/tcp
netops-web healthy 0.0.0.0:3005->80/tcp
netops-db  healthy 0.0.0.0:5435->5432/tcp
```

Health:

```http
GET /api/healthz
HTTP/1.1 200 OK
```

Response:

```json
{"status":"ok"}
```

API log confirmed:

```text
SNMP poller disabled
```

## Cache Smoke

Initial row count for pilot peer:

```text
0
```

First request:

```http
GET /api/bgp/peers/1/172.28.1.138/drilldown?source=snapshot&include_policies=true&include_policy_objects=true
```

Observed summary:

```json
{
  "peer": "172.28.1.138",
  "deviceId": 1,
  "source": "ssh_full_config",
  "configBuildSource": "raw_config",
  "root": {
    "peer": "172.28.1.138",
    "asNumber": 262663,
    "description": "WIFIZAO.BRT",
    "status": "FOUND"
  },
  "families": ["ipv4_unicast"],
  "policies": [
    {
      "afiSafi": "ipv4_unicast",
      "direction": "import",
      "policyName": "AS262663-WIFIZAO.BRT-Import-IPv4",
      "status": "FOUND"
    },
    {
      "afiSafi": "ipv4_unicast",
      "direction": "export",
      "policyName": "AS262663-WIFIZAO.BRT-Export-IPv4",
      "status": "FOUND"
    }
  ],
  "routeTables": {
    "received": { "requested": false, "available": false, "prefixCount": null },
    "accepted": { "requested": false, "available": false, "prefixCount": null },
    "advertised": { "requested": false, "available": false, "prefixCount": null }
  }
}
```

Persisted row:

```text
id=1
device_id=1
peer=172.28.1.138
source=snapshot
config_build_source=raw_config
warnings=0
collected_at=2026-05-22 22:19:11.19
expires_at=2026-06-02 18:10:46.48
```

Second identical request:

- HTTP 200
- root `FOUND`
- `ipv4_unicast` present
- route tables still `requested=false`
- table row count remained `1`

Cache hit is not exposed in API response. Count staying at `1` after the second identical request is runtime evidence that fresh cache was reused instead of inserting a second row.

## History Endpoint

Request:

```http
GET /api/bgp/peers/1/172.28.1.138/drilldown/history
```

Observed:

```json
{
  "deviceId": 1,
  "peer": "172.28.1.138",
  "count": 1,
  "items": [
    {
      "id": 1,
      "source": "snapshot",
      "configBuildSource": "raw_config",
      "warnings": [],
      "createdAt": "2026-05-26T18:10:46.484Z",
      "collectedAt": "2026-05-22T22:19:11.190Z",
      "expiresAt": "2026-06-02T18:10:46.480Z"
    }
  ]
}
```

## UI Smoke

Route:

```http
GET /bgp/peer-drilldown?deviceId=1&peer=172.28.1.138&auto=1
HTTP/1.1 200 OK
```

Served bundle contains:

- `Histórico`
- `drilldown/history`
- `SSH detail leve`
- `Protegido por feature gate`
- `BGP_DRILLDOWN_SSH_DETAIL_DISABLED`
- `Route tables`
- `not requested`

Detail endpoint remained protected:

```http
POST /api/bgp/peers/1/172.28.1.138/drilldown/detail
HTTP/1.1 503 Service Unavailable
```

```json
{
  "error": "BGP_DRILLDOWN_SSH_DETAIL_DISABLED"
}
```

## Logs

API logs from the smoke window showed:

- health checks
- snapshot drilldown `200`
- history `200`
- SSH detail guard `503`
- `SNMP poller disabled`

Grep checks found:

- no SSH execution
- no SNMP poll cycle
- no discovery
- no route-table command
- no forbidden command
- no bearer token
- no secret output

## GO Criteria

- [x] migration applied
- [x] API/web healthy
- [x] drilldown 200
- [x] cache persists
- [x] history returns data
- [x] UI history OK
- [x] zero SSH
- [x] zero SNMP
- [x] zero discovery

## Verdict

GO for D5B. BGP peer drilldown cache/history works at runtime with guard flags disabled and no network collection.
