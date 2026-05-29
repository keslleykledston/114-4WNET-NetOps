# PHASE BGP Peer Drilldown D4.2B - SSH Detail Real Smoke Plan

**Date:** 2026-05-26
**Status:** PLAN ONLY - do not execute without NOC approval
**Base commits:**

- `0a5d5eb feat(bgp): guard SSH detail for peer drilldown`
- `8cf5d55 docs(bgp): document peer drilldown SSH detail flag-off smoke`

## Scope

Prepare a future one-peer SSH detail smoke for BGP peer drilldown.

This document is not execution evidence. No SSH, SNMP, discovery, rebuild, flag enablement, or device change was performed while creating this plan.

## Pilot Target

- Device: `device_id=1`
- Peer: `172.28.1.138`
- API route: `POST /api/bgp/peers/1/172.28.1.138/drilldown/detail`
- Snapshot prerequisite:
  - `GET /api/bgp/peers/1/172.28.1.138/drilldown?source=snapshot&include_policies=true&include_policy_objects=true`
  - Expected: root peer found, `ipv4_unicast` found, import/export policies found, route tables `requested=false`

## Required Window

- Execution requires approved NOC window.
- Operator must confirm device is stable before start.
- Operator must watch API logs during the request.
- Only one peer may be tested.
- Stop immediately on timeout, auth failure, unexpected command, or device-side warning.

## Feature Flags

Default state:

```text
BGP_DRILLDOWN_SSH_DETAIL_ENABLED=false
SNMP_POLL_ENABLED=false
```

Execution window state:

```text
BGP_DRILLDOWN_SSH_DETAIL_ENABLED=true
SNMP_POLL_ENABLED=false
```

Rules:

- Enable `BGP_DRILLDOWN_SSH_DETAIL_ENABLED` only for the approved smoke window.
- Keep `SNMP_POLL_ENABLED=false` during the smoke.
- Do not enable discovery.
- Do not run bulk jobs.
- Roll back the flag immediately after the one request.

## Allowed Commands

Only these light read-only commands are allowed for the pilot peer and objects discovered from snapshot:

```text
display bgp peer 172.28.1.138
display bgp peer 172.28.1.138 verbose
display route-policy <POLICY>
display ip ip-prefix <NAME>
display ip ipv6-prefix <NAME>
display ip as-path-filter <NAME>
display ip community-filter <NAME>
display ip extcommunity-filter <NAME>
```

Object names must pass the D4.1 safe-name validator. The command builder must reject dangerous characters and blocked tokens before opening SSH.

## Forbidden Commands And Tokens

Route-table commands are forbidden:

```text
display bgp routing-table peer 172.28.1.138 received-routes
display bgp routing-table peer 172.28.1.138 accepted-routes
display bgp routing-table peer 172.28.1.138 advertised-routes
```

Configuration, reset, write, destructive, and shell-injection tokens are forbidden:

```text
system-view
undo
reset
clear
save
commit
delete
reboot
format
;
|
&
`
$
>
<
newline
```

The smoke is NO-GO if any forbidden command or token appears in planned command logs.

## Timeout

Recommended limits for the first real smoke:

- One API request only.
- SSH connection timeout: use existing D4.1 short/moderate collector timeout.
- Total request budget: maximum 60 seconds.
- Stop on first command failure if failure indicates parser, validator, auth, timeout, or device safety issue.

## Preflight Checklist

- [ ] NOC window approved.
- [ ] Operator identified.
- [ ] Device `device_id=1` confirmed as correct pilot.
- [ ] Peer `172.28.1.138` confirmed as safe pilot.
- [ ] Current branch and HEAD recorded.
- [ ] Runtime health OK before test.
- [ ] `SNMP_POLL_ENABLED=false`.
- [ ] `BGP_DRILLDOWN_SSH_DETAIL_ENABLED=false` before window.
- [ ] Snapshot endpoint returns expected peer root, family, and policies.
- [ ] Route tables show `requested=false`.
- [ ] No unrelated jobs running.
- [ ] API logs are being tailed.

## Planned Runtime Steps

1. Confirm current guard:

```bash
docker exec netops-api printenv BGP_DRILLDOWN_SSH_DETAIL_ENABLED
docker exec netops-api printenv SNMP_POLL_ENABLED
```

Expected:

```text
BGP_DRILLDOWN_SSH_DETAIL_ENABLED=false
SNMP_POLL_ENABLED=false
```

2. Confirm health:

```bash
curl -sS -i http://localhost:8085/api/healthz
```

Expected:

```http
HTTP/1.1 200 OK
```

3. Confirm snapshot still works:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8085/api/bgp/peers/1/172.28.1.138/drilldown?source=snapshot&include_policies=true&include_policy_objects=true"
```

Expected:

- peer root `FOUND`
- `ipv4_unicast` present
- import/export policies present
- `routeTables.received.requested=false`
- `routeTables.accepted.requested=false`
- `routeTables.advertised.requested=false`

4. Enable SSH detail only for window.

Use project-approved runtime override method. Do not edit committed files during smoke. Keep SNMP disabled:

```text
BGP_DRILLDOWN_SSH_DETAIL_ENABLED=true
SNMP_POLL_ENABLED=false
```

5. Execute exactly one SSH detail request:

```bash
curl -sS -i \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST \
  "http://localhost:8085/api/bgp/peers/1/172.28.1.138/drilldown/detail" \
  -d '{
    "includePeerVerbose": true,
    "includeRoutePolicies": true,
    "includePolicyObjects": true
  }'
```

Expected:

- HTTP 200 if device login and commands succeed.
- `source=ssh_detail`.
- `collected_at` present.
- command list contains only allowlisted commands.
- evidence is redacted.
- route tables remain not requested.

6. Roll back immediately:

```text
BGP_DRILLDOWN_SSH_DETAIL_ENABLED=false
SNMP_POLL_ENABLED=false
```

7. Recheck protected endpoint after rollback:

```bash
curl -sS -i \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST \
  "http://localhost:8085/api/bgp/peers/1/172.28.1.138/drilldown/detail" \
  -d '{
    "includePeerVerbose": true,
    "includeRoutePolicies": true,
    "includePolicyObjects": true
  }'
```

Expected:

```http
HTTP/1.1 503 Service Unavailable
```

```json
{
  "error": "BGP_DRILLDOWN_SSH_DETAIL_DISABLED"
}
```

## Log Validation

Capture API logs from the smoke window only.

Required checks:

- [ ] No SNMP poll cycle.
- [ ] No discovery.
- [ ] No received-routes.
- [ ] No accepted-routes.
- [ ] No advertised-routes.
- [ ] No `system-view`.
- [ ] No `undo`, `reset`, `clear`, `save`, `commit`, `delete`, `reboot`, or `format`.
- [ ] No raw password.
- [ ] No raw cipher value.
- [ ] No raw simple password.
- [ ] No unredacted community secret.
- [ ] No bearer token.

Suggested grep:

```bash
docker logs --since 10m netops-api 2>&1 | rg -n \
  "snmp|discover|discovery|received-routes|accepted-routes|advertised-routes|system-view|undo|reset|clear|save|commit|delete|reboot|format|password|cipher|simple|community|Bearer|Authorization" -i
```

Expected:

- No forbidden command execution.
- Any sensitive evidence must appear only as redacted text.
- `community` may appear only as object type or redacted evidence, never as secret value.

## GO Criteria

- [ ] NOC approved execution.
- [ ] API health OK before request.
- [ ] Snapshot drilldown OK before request.
- [ ] `SNMP_POLL_ENABLED=false`.
- [ ] SSH detail flag enabled only during window.
- [ ] Exactly one peer requested.
- [ ] HTTP 200 from detail endpoint.
- [ ] `source=ssh_detail`.
- [ ] Evidence redacted.
- [ ] Only allowlisted light commands executed.
- [ ] No route-table commands.
- [ ] No SNMP.
- [ ] No discovery.
- [ ] Rollback to `BGP_DRILLDOWN_SSH_DETAIL_ENABLED=false`.
- [ ] Post-rollback detail endpoint returns 503.

## NO-GO Criteria

- [ ] NOC window absent or cancelled.
- [ ] Wrong device or peer.
- [ ] Snapshot peer not found.
- [ ] Snapshot policies missing unexpectedly.
- [ ] `SNMP_POLL_ENABLED` cannot be forced false.
- [ ] Flag cannot be rolled back quickly.
- [ ] Any forbidden command appears.
- [ ] Any heavy route-table command appears.
- [ ] Any write/config/reset token appears.
- [ ] Logs expose password, cipher, simple, token, or unredacted community secret.
- [ ] Timeout or repeated SSH auth failure.
- [ ] API returns unexpected 5xx other than planned rollback 503.

## Rollback

Immediate rollback state:

```text
BGP_DRILLDOWN_SSH_DETAIL_ENABLED=false
SNMP_POLL_ENABLED=false
```

Rollback verification:

- `POST /api/bgp/peers/1/172.28.1.138/drilldown/detail` returns `503 BGP_DRILLDOWN_SSH_DETAIL_DISABLED`.
- Snapshot endpoint still returns `200`.
- API logs show no further SSH detail commands after rollback.

## Verdict

Plan ready for future D4.2B execution, but execution is NO-GO until explicit NOC approval and operator presence.
