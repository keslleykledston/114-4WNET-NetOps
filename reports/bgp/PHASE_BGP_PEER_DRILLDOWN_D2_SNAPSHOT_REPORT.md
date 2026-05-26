# PHASE BGP Peer Drilldown D2 — Snapshot Report

**Date:** 2026-05-26
**Phase:** D2 (snapshot / raw_config only)
**Status:** GO for D3 UI planning

---

## Summary

Read-only BGP peer drilldown API implemented. Parses `collected_configs.raw_config` (primary) via existing Huawei VRP parsers. `parsed_config` is fallback only. No SSH, discovery, flags, NetBox, SNMP, or device writes.

---

## Files created / changed

| Path | Role |
|------|------|
| `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown.types.ts` | Contract types (`bgp-peer-drilldown-v1`) |
| `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown.builder.ts` | Pure drilldown builder (selftest-safe, no DB) |
| `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown.service.ts` | DB load + `getBgpPeerDrilldown` |
| `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown.controller.ts` | Query validation |
| `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown.routes.ts` | Express routes |
| `workspace/artifacts/api-server/src/routes/index.ts` | Mount drilldown router at API root |
| `workspace/.../parsers/__fixtures__/bgp-peer-drilldown-snapshot.txt` | Combined BGP + policies fixture |
| `tools/bgp-peer-drilldown-snapshot-selftest.mjs` | Cases A–E |

**Reused (unchanged):**

- `bgp-peer-dependency-parser.ts`
- `policy-dependency-pipeline.ts` (`buildPolicyDependencyConfigFromSnapshot` + `rawConfig`)

---

## Endpoint

```http
GET /api/bgp/peers/:deviceId/:peer/drilldown
```

**Auth:** `devices.read`

**Query (v1):**

| Param | Default | Notes |
|-------|---------|-------|
| `source` | `snapshot` | Only `snapshot` accepted; others → 400 |
| `include_policies` | `true` | Route-policy nodes + edges |
| `include_policy_objects` | `true` | Catalog object payloads on policies |
| `snapshot_id` | — | Optional specific snapshot |
| `job_id` | — | Optional `discovery_run_id` |

**Errors:** 404 device, 422 no snapshot/config, 400 bad params.

**Runtime scope:** endpoint is GET/read-only. It loads DB snapshot/config only; it does not call SSH detail, route query, SNMP, discovery, NetBox, or flag-gated collectors.

---

## Example response (peer 172.28.1.138)

```json
{
  "contractVersion": "bgp-peer-drilldown-v1",
  "deviceId": 1,
  "peer": "172.28.1.138",
  "source": "ssh_full_config",
  "configBuildSource": "raw_config",
  "root": {
    "peer": "172.28.1.138",
    "asNumber": 262663,
    "description": "WIFIZAO.BRT",
    "status": "FOUND"
  },
  "families": [{
    "afiSafi": "ipv4_unicast",
    "enabled": true,
    "importPolicy": "AS262663-WIFIZAO.BRT-Import-IPv4",
    "exportPolicy": "AS262663-WIFIZAO.BRT-Export-IPv4",
    "defaultRouteAdvertise": true,
    "effectivePolicySource": "peer"
  }],
  "effectivePolicies": [
    { "direction": "import", "policyName": "AS262663-WIFIZAO.BRT-Import-IPv4", "status": "FOUND" },
    { "direction": "export", "policyName": "AS262663-WIFIZAO.BRT-Export-IPv4", "status": "FOUND" }
  ],
  "dependencies": [
    { "dependencyType": "route-policy", "status": "FOUND" },
    { "dependencyType": "ip-prefix", "dependencyName": "AS262663-WIFIZAO", "status": "FOUND" }
  ],
  "runtime": null,
  "routeTables": { "received": { "requested": false }, "accepted": { "requested": false }, "advertised": { "requested": false } }
}
```

---

## Selftests

| Command | Result |
|---------|--------|
| `pnpm dlx tsx tools/bgp-peer-drilldown-snapshot-selftest.mjs` | PASS (A–E) |
| `pnpm dlx tsx tools/bgp-peer-dependency-selftest.mjs` | PASS |
| `pnpm dlx tsx tools/compliance-prefix-route-policy-selftest.mjs` | PASS |
| `pnpm dlx tsx tools/policy-dependency-catalog-pipeline-selftest.mjs` | PASS |

**Cases covered:**

- **A** `172.28.1.138` — root AS/description, ipv4_unicast policies, ip-prefix dependency FOUND
- **B** `2804:5984:B000:1::D6` — ipv6_unicast import/export, default-route-advertise
- **C** `2001:12F8:0:21::253` — IX-AM peer-group inheritance + next-hop-local
- **D** missing route-policy → `MISSING` when catalog loaded
- **E** no route-policy catalog → `UNKNOWN` (not FAIL)

**Retake validation (2026-05-26):**

| Check | Result |
|-------|--------|
| D1 docs present | YES |
| Endpoint route file present | YES |
| Route mounted in `src/routes/index.ts` | YES |
| `pnpm dlx tsx tools/bgp-peer-drilldown-snapshot-selftest.mjs` | PASS (`A`, `B`, `C`, `C2`, `D`, `E`) |
| Peer `172.28.1.138` case | PASS (`configBuildSource=raw_config`, root/family/import/export FOUND) |
| Catalog absent behavior | PASS (`UNKNOWN`, not `FAIL`) |
| API typecheck retake | PASS from `workspace/` |
| Workspace typecheck retake | PASS from `workspace/` |
| API build retake | PASS from `workspace/` |
| SSH/SNMP/discovery/NetBox used during retake | NO |

---

## Validation

Initial `pnpm --filter @workspace/api-server run typecheck` failed from repository wrapper because root has no `package.json` and no `node_modules/.bin/tsc`. Correct project root is `workspace/`.

| Command | Result |
|---------|--------|
| `pnpm typecheck` (from `workspace/`) | OK |
| `pnpm --filter @workspace/api-server run typecheck` (from `workspace/`) | OK |
| `pnpm --filter @workspace/api-server run build` (from `workspace/`) | OK |
| `pnpm dlx tsx ../tools/bgp-peer-drilldown-snapshot-selftest.mjs` (from `workspace/`) | OK |
| `pnpm dlx tsx ../tools/bgp-peer-dependency-selftest.mjs` (from `workspace/`) | OK |
| `pnpm dlx tsx ../tools/compliance-prefix-route-policy-selftest.mjs` (from `workspace/`) | OK |
| `pnpm dlx tsx ../tools/policy-dependency-catalog-pipeline-selftest.mjs` (from `workspace/`) | OK |

No dependency install required. TypeScript already exists in `workspace/package.json` and `workspace/pnpm-lock.yaml`.

---

## Limitations (D2)

- `source=snapshot` only; no SSH detail / SNMP runtime in `runtime` (always `null`)
- No received/accepted/advertised route tables (`routeTables.*.requested=false`)
- `community-list` if-match parsed in drilldown nodes; pipeline graph still omits community-list edges until pipeline extended
- Peer must appear in at least one address-family block (root-only peer → warning)
- Requires `collected_configs.raw_config` or discovery snapshot row in DB for API path

---

## GO / NO-GO — D3 UI

| Criterion | D2 |
|-----------|-----|
| Read-only API | YES |
| Contract-stable JSON | YES |
| Peer root + families + effective policies | YES |
| Policy dependency tree | YES |
| Peer-group inheritance | YES |
| raw_config primary | YES |

**Verdict: GO** for D3 UI against this endpoint. Defer route-table tabs and SSH runtime panel to D4/D5 per architecture plan.
