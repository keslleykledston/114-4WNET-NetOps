# PHASE BGP Peer Drilldown D4 - SSH Detail Plan and Guard Report

**Date:** 2026-05-26
**Phase:** D4 initial guard implementation
**Status:** GO for guarded initial merge

## Objective

Add protected read-only SSH detail path for one BGP peer, without route-table commands and without executing SSH while the feature gate is false.

## Feature Gate

- Env: `BGP_DRILLDOWN_SSH_DETAIL_ENABLED`
- Default: `false`
- Disabled behavior: `POST /api/bgp/peers/:deviceId/:peer/drilldown/detail` returns `503 BGP_DRILLDOWN_SSH_DETAIL_DISABLED`
- Gate is checked before DB device credential read and before `runSSHCommands`.

## Endpoint

```http
POST /api/bgp/peers/:deviceId/:peer/drilldown/detail
Content-Type: application/json

{
  "includePeerVerbose": true,
  "includeRoutePolicies": true,
  "includePolicyObjects": true
}
```

## Allowed Commands

- `display bgp peer <PEER>`
- `display bgp peer <PEER> verbose`
- `display route-policy <POLICY_NAME>`
- `display ip ip-prefix <NAME>`
- `display ip ipv6-prefix <NAME>`
- `display ip as-path-filter <NAME>`
- `display ip community-filter <NAME>`
- `display ip extcommunity-filter <NAME>`

## Blocked Commands

- `display bgp routing-table peer <PEER> received-routes`
- `display bgp routing-table peer <PEER> accepted-routes`
- `display bgp routing-table peer <PEER> advertised-routes`

Dangerous chars blocked:

- `; | & \` $ > < newline`

Blocked tokens:

- `system-view`
- `undo`
- `reset`
- `clear`
- `save`
- `commit`
- `delete`
- `reboot`
- `format`

## Files Changed

| Path | Purpose |
| --- | --- |
| `workspace/artifacts/api-server/src/lib/env.ts` | feature gate default false |
| `workspace/artifacts/api-server/src/lib/ssh.ts` | optional shorter SSH timeouts for D4 path |
| `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown.routes.ts` | POST detail route |
| `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown.controller.ts` | request parsing and 503 gate response |
| `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown-ssh-detail.ts` | command builder, allowlist, sanitization |
| `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown-ssh-detail.service.ts` | gated service, snapshot-driven command selection |
| `workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown-ssh-detail.selftest.ts` | no-SSH selftest |
| `workspace/artifacts/netops-manager/src/features/bgp-drilldown/*` | detail client/types |
| `workspace/artifacts/netops-manager/src/pages/bgp-peer-drilldown.tsx` | protected UI action/status/evidence |

## UI

- Adds `SSH detail leve` panel.
- Button: `Atualizar detalhe via SSH`.
- Warning: `Executa comandos read-only leves no equipamento. Não coleta rotas.`
- Status badges: `idle`, `running`, `disabled`, `completed`, `failed`.
- When flag false, POST returns 503 and UI marks detail as `disabled`.
- Route tables remain disabled/not requested.

## Validation

```bash
pnpm --dir workspace/scripts exec tsx ../artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown-ssh-detail.selftest.ts
pnpm typecheck
PORT=24780 BASE_PATH=/ pnpm build
tools/apply-containers.sh api web
```

Results:

- D4 selftest: PASS
- Typecheck: PASS
- Build: PASS
- Containers: `netops-api`, `netops-web`, `netops-db` healthy

## Smoke Flag False

Request:

```bash
POST http://localhost:8085/api/bgp/peers/1/172.28.1.138/drilldown/detail
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

## Zero SSH / SNMP / Discovery

- No SSH command was executed during implementation or smoke.
- Flag false returns before `runSSHCommands`.
- No SNMP code added.
- No discovery code added.
- No NetBox code added.
- No route-table command execution added.

## GO Criteria

- [x] flag false padrão
- [x] endpoint protegido
- [x] comando builder seguro
- [x] comandos pesados bloqueados
- [x] selftests PASS
- [x] POST com flag false retorna 503
- [x] zero SSH real
- [x] UI mostra ação protegida e status disabled quando gate bloqueia

## Limitations / D4 Next

- Browser automation not run; validation used build + deployed route/API smoke.
- Feature remains disabled by default.
- True-flag live SSH pilot still requires explicit operator approval and controlled run.
