# PHASE BGP Peer Drilldown D3 UI Report

**Date:** 2026-05-26
**Phase:** D3 - frontend snapshot drilldown
**Status:** GO

## Summary

Read-only UI for one BGP peer now consumes D2 endpoint:

```http
GET /api/bgp/peers/:deviceId/:peer/drilldown?source=snapshot&include_policies=true&include_policy_objects=true
```

No SSH, SNMP, discovery, NetBox, route queries, flags, or device writes were added.

## Files Created / Changed

| Path | Role |
| --- | --- |
| `workspace/artifacts/netops-manager/src/features/bgp-drilldown/types.ts` | D2 response types |
| `workspace/artifacts/netops-manager/src/features/bgp-drilldown/bgp-drilldown-api.ts` | GET-only drilldown client |
| `workspace/artifacts/netops-manager/src/features/bgp-drilldown/bgp-drilldown-badges.tsx` | status/source/AFI badges |
| `workspace/artifacts/netops-manager/src/features/bgp-drilldown/bgp-policy-tree.tsx` | import/export dependency tree |
| `workspace/artifacts/netops-manager/src/features/bgp-drilldown/bgp-peer-drilldown-view.tsx` | read-only drilldown UI |
| `workspace/artifacts/netops-manager/src/features/bgp-drilldown/index.ts` | feature exports |
| `workspace/artifacts/netops-manager/src/pages/bgp-peer-drilldown.tsx` | route page and form |
| `workspace/artifacts/netops-manager/src/App.tsx` | route `/bgp/peer-drilldown` |
| `workspace/artifacts/netops-manager/src/components/layout.tsx` | sidebar item `BGP Drilldown` |
| `workspace/artifacts/netops-manager/src/features/bgp/bgp-panel.tsx` | peer row link to drilldown |

## Route

- `/bgp/peer-drilldown`
- Smoke URL: `/bgp/peer-drilldown?deviceId=1&peer=172.28.1.138&auto=1`

## UX

- Header shows `Source: snapshot`, `Read-only`, and `Sem comandos no equipamento`.
- Query form uses device selector from existing devices API plus manual peer input.
- Peer default is `172.28.1.138`.
- Sections rendered: root config, address families, effective policies, import/export policy tree, policies detail, dependencies, warnings, raw evidence refs.
- Route tables section is disabled:
  - `received-routes: not requested`
  - `accepted-routes: not requested`
  - `advertised-routes: not requested`
- Route table text shown: `Consultas de rotas são comandos pesados e serão tratadas em fase futura com confirmação.`
- Raw lines are not rendered; only sanitized evidence refs appear.

## Smoke

Container smoke after `tools/apply-containers.sh api web`:

```bash
curl http://localhost:3005/bgp/peer-drilldown?deviceId=1\&peer=172.28.1.138\&auto=1
```

Result: `200 OK`, SPA route served by `netops-web`.

Authenticated API smoke:

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
    "group": null,
    "connectInterface": null,
    "passwordPresent": false,
    "status": "FOUND"
  },
  "families": ["ipv4_unicast"],
  "effectivePolicies": [
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
  "warnings": []
}
```

Bundle smoke confirmed text exists in deployed asset:

- `BGP Drilldown`
- `Source: snapshot`
- `Esta tela usa snapshot salvo`
- `Policies detail`
- `Route tables`
- `not requested`
- `include_policy_objects`

No screenshot file was produced; smoke is command/API based.

## Validations

| Check | Result |
| --- | --- |
| `/bgp/peer-drilldown` route served | PASS |
| D2 endpoint queried with `source=snapshot` | PASS |
| Peer `172.28.1.138` root config | PASS |
| `ipv4_unicast` address-family | PASS |
| import/export policies | PASS |
| dependency tree | PASS |
| route tables disabled/not requested | PASS |
| no SSH code in D3 feature | PASS |
| no SNMP code in D3 feature | PASS |
| no discovery code in D3 feature | PASS |
| `pnpm typecheck` | PASS |
| `PORT=24780 BASE_PATH=/ pnpm build` | PASS |
| containers updated | PASS |

## Limitations

- Browser automation tool was not installed locally; UI smoke used deployed SPA route, bundle text checks, and authenticated API response.
- API response field `source` still reports evidence source (`ssh_full_config`); UI labels request mode as `snapshot` and config build source as `raw_config`.
- Route queries remain future work by design.

## GO / NO-GO D4

GO for D4.

- [x] rota `/bgp/peer-drilldown` existe
- [x] tela consulta endpoint D2
- [x] peer `172.28.1.138` renderiza root config
- [x] address-family renderiza
- [x] import/export policies renderizam
- [x] dependency tree renderiza
- [x] route tables ficam disabled/not requested
- [x] sem SSH
- [x] sem SNMP
- [x] sem discovery
- [x] typecheck OK
- [x] build OK
