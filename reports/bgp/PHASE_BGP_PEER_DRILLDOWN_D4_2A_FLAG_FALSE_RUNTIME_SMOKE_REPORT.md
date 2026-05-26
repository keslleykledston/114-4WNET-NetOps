# PHASE BGP Peer Drilldown D4.2A - Flag False Runtime Smoke

**Date:** 2026-05-26
**Commit:** `0a5d5eb feat(bgp): guard SSH detail for peer drilldown`
**Status:** GO with runtime guard confirmed

## Scope

Validate D4 SSH detail runtime with:

- `BGP_DRILLDOWN_SSH_DETAIL_ENABLED=false`
- no SSH execution
- no SNMP execution
- no discovery
- no route-table commands
- no device changes

## HEAD

```text
0a5d5eb feat(bgp): guard SSH detail for peer drilldown
2ca9a7c feat(bgp): add snapshot peer drilldown UI
97cfcf6 feat(bgp): add snapshot-based peer drilldown endpoint
ffa4181 docs(collection): document SNMP pilot network NO-GO
a0ef16d fix(operational): add SNMP preflight and document runtime pilot
```

## Runtime Environment

Final compliant runtime used a temporary Docker Compose override, without changing `docker-compose.yml`:

```bash
docker compose -f docker-compose.yml -f <(printf '%s\n' \
  'services:' \
  '  api:' \
  '    environment:' \
  '      SNMP_POLL_ENABLED: "false"' \
  '      BGP_DRILLDOWN_SSH_DETAIL_ENABLED: "false"') \
  up -d --build --force-recreate api web
```

Container env:

```text
BGP_DRILLDOWN_SSH_DETAIL_ENABLED=false
SNMP_POLL_ENABLED=false
```

Note: first `tools/apply-containers.sh api web` run used project defaults and started the legacy SNMP poller. That run was discarded for D4.2A evidence. Final smoke was rerun with `SNMP_POLL_ENABLED=false`; logs then showed `SNMP poller disabled`.

## Health

```http
GET /api/healthz
HTTP/1.1 200 OK
```

Response:

```json
{"status":"ok"}
```

Containers:

```text
netops-api  healthy  0.0.0.0:8085->8080/tcp
netops-web  healthy  0.0.0.0:3005->80/tcp
netops-db   healthy  0.0.0.0:5435->5432/tcp
```

## Snapshot Drilldown Smoke

Request:

```http
GET /api/bgp/peers/1/172.28.1.138/drilldown?source=snapshot&include_policies=true&include_policy_objects=true
```

Result summary:

```json
{
  "peer": "172.28.1.138",
  "deviceId": 1,
  "requestSource": "snapshot",
  "responseSource": "ssh_full_config",
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
  "runtime": null,
  "routeTables": {
    "received": { "requested": false, "available": false, "prefixCount": null },
    "accepted": { "requested": false, "available": false, "prefixCount": null },
    "advertised": { "requested": false, "available": false, "prefixCount": null }
  }
}
```

Note: request mode is `source=snapshot`; response field `source` remains evidence source `ssh_full_config` from D2 model.

## SSH Detail Flag False Smoke

Request:

```http
POST /api/bgp/peers/1/172.28.1.138/drilldown/detail
Content-Type: application/json

{
  "includePeerVerbose": true,
  "includeRoutePolicies": true,
  "includePolicyObjects": true
}
```

Response:

```http
HTTP/1.1 503 Service Unavailable
```

```json
{
  "error": "BGP_DRILLDOWN_SSH_DETAIL_DISABLED",
  "message": "BGP SSH detail is disabled. Set BGP_DRILLDOWN_SSH_DETAIL_ENABLED=true to enable read-only light detail."
}
```

## UI Smoke

Route:

```http
GET /bgp/peer-drilldown?deviceId=1&peer=172.28.1.138&auto=1
HTTP/1.1 200 OK
```

Deployed bundle contains:

- `SSH detail leve`
- `Atualizar detalhe via SSH`
- `Protegido por feature gate`
- `BGP_DRILLDOWN_SSH_DETAIL_ENABLED`
- `BGP_DRILLDOWN_SSH_DETAIL_DISABLED`
- `Não coleta rotas`
- `Route tables`
- `not requested`
- `detail=`

No browser automation was used. Static UI validation is via served SPA and deployed bundle text. Runtime protection is enforced by backend 503 before SSH.

## Logs

Final compliant API logs:

```text
Server listening
SNMP poller disabled
GET /api/healthz -> 200
GET /api/bgp/peers/1/172.28.1.138/drilldown -> 200
POST /api/bgp/peers/1/172.28.1.138/drilldown/detail -> 503
```

Log grep after waiting more than the 15s poller window found:

- no SSH execution
- no SNMP poll cycle
- no discovery
- no route-table command
- no secrets
- no device command output

## GO Criteria

- [x] API health OK
- [x] snapshot drilldown OK
- [x] detail endpoint returns 503
- [x] UI shows protected action
- [x] zero SSH
- [x] zero SNMP in final compliant run
- [x] zero discovery

## Verdict

GO for D4.2A flag-false runtime guard. Do not run true-flag SSH pilot without explicit operator approval.
