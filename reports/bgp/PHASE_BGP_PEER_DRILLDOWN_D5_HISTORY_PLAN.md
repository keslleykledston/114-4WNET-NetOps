# PHASE BGP Peer Drilldown D5 - Cache + History

**Date:** 2026-05-26
**Status:** GO after local validation

## Scope

D5 adds persistence and read-only history for BGP peer drilldown results.

Safety boundaries:

- no SSH execution
- no SNMP execution
- no discovery
- no feature flag enablement
- no device changes
- no NetBox changes

## Files

- `workspace/lib/db/src/schema/bgp_peer_drilldown_snapshots.ts`
- `workspace/lib/db/src/schema/index.ts`
- `workspace/lib/db/migrations/0017_bgp_peer_drilldown_snapshots.sql`
- `workspace/artifacts/api-server/src/lib/env.ts`
- `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown-cache.ts`
- `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown-cache.selftest.ts`
- `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown.controller.ts`
- `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown.routes.ts`
- `workspace/artifacts/netops-manager/src/features/bgp-drilldown/bgp-drilldown-api.ts`
- `workspace/artifacts/netops-manager/src/features/bgp-drilldown/index.ts`
- `workspace/artifacts/netops-manager/src/features/bgp-drilldown/types.ts`
- `workspace/artifacts/netops-manager/src/pages/bgp-peer-drilldown.tsx`

## Table

Table: `bgp_peer_drilldown_snapshots`

Columns:

- `id`
- `device_id`
- `peer`
- `source`
- `config_build_source`
- `peer_hash`
- `collected_at`
- `expires_at`
- `snapshot_json`
- `runtime_json`
- `warnings`
- `created_at`

Indexes:

- `device_id, peer, created_at`
- `device_id, peer, expires_at`
- `source`
- `peer_hash`

## Persistence

Snapshot drilldown persists a read-only audit/cache row after the D2 builder returns successfully.
For default full snapshot requests, the API reads the latest unexpired persisted row before recomputing the parser result.

Current source rules:

- request `source=snapshot` persists `source=snapshot`
- future `ssh_detail` is reserved, but not enabled in D5
- cache does not replace or mutate original discovery snapshot or raw config
- cache read uses TTL and is limited to default full snapshot requests
- route tables remain `requested=false`

TTL:

- env: `BGP_DRILLDOWN_CACHE_TTL_SECONDS`
- default: 7 days
- `expires_at` is stored per row

## API

Existing endpoint remains:

```http
GET /api/bgp/peers/:deviceId/:peer/drilldown?source=snapshot&include_policies=true&include_policy_objects=true
```

New endpoint:

```http
GET /api/bgp/peers/:deviceId/:peer/drilldown/history?limit=20
```

Response shape:

```json
{
  "deviceId": 1,
  "peer": "172.28.1.138",
  "items": [
    {
      "id": 1,
      "deviceId": 1,
      "peer": "172.28.1.138",
      "source": "snapshot",
      "configBuildSource": "raw_config",
      "peerHash": "sha256",
      "collectedAt": "2026-05-26T00:00:00.000Z",
      "expiresAt": "2026-06-02T00:00:00.000Z",
      "warnings": [],
      "createdAt": "2026-05-26T00:00:00.000Z"
    }
  ]
}
```

## UI

Page: `/bgp/peer-drilldown`

New tab:

- `Histórico`

Shows:

- `collected_at`
- `source`
- `warnings`
- `config source`
- `expires_at`

Empty/error/loading states are shown without executing device commands.

## Validation

Commands:

```bash
pnpm --dir workspace/scripts exec tsx ../artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown-cache.selftest.ts
pnpm typecheck
PORT=24780 BASE_PATH=/ pnpm build
```

Expected:

- D5 cache selftest PASS
- typecheck PASS
- build PASS

Observed:

- `pnpm --dir workspace/scripts exec tsx ../artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown-cache.selftest.ts` PASS
- `pnpm typecheck` PASS
- `PORT=24780 BASE_PATH=/ pnpm build` PASS

Runtime smoke after migration apply:

```http
GET /api/bgp/peers/1/172.28.1.138/drilldown?source=snapshot&include_policies=true&include_policy_objects=true
GET /api/bgp/peers/1/172.28.1.138/drilldown/history
```

Expected:

- snapshot endpoint returns 200
- history endpoint returns at least one persisted item after snapshot request
- UI `Histórico` tab renders item
- zero SSH
- zero SNMP
- zero discovery

## GO Criteria

- [x] table migration exists
- [x] Drizzle schema exports table
- [x] snapshot result persists
- [x] `GET /drilldown/history` returns rows
- [x] UI shows `Histórico`
- [x] route tables remain disabled/not requested
- [x] selftest PASS
- [x] typecheck PASS
- [x] build PASS
- [x] zero SSH
- [x] zero SNMP
- [x] zero discovery

## Limits

- D5 does not enable SSH detail.
- D5 serves default full snapshot drilldown from fresh cache rows when available.
- D5 does not prune expired rows automatically.
- D5 does not alter original discovery snapshots or collected configs.
