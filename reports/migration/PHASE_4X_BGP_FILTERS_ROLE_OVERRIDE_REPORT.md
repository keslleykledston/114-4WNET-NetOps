# FASE 4.x — BGP Filters + Role Override Local

Data: 2026-05-20

## Objetivo

Trazer do `60-bgp_manager` o comportamento operacional de filtros BGP e override de papel por peer, sem alterar roteador e sem mudar layout global do 114.

## Arquivos alterados / principais

| Area | Path |
|------|------|
| Frontend BGP panel | `workspace/artifacts/netops-manager/src/features/bgp/bgp-panel.tsx` |
| NetOps page | `workspace/artifacts/netops-manager/src/pages/netops-operations.tsx` |
| API service | `workspace/artifacts/api-server/src/modules/netops/service.ts` |
| API routes | `workspace/artifacts/api-server/src/modules/netops/routes.ts` |
| BGP normalizer | `workspace/artifacts/api-server/src/modules/netops/bgp/bgp-normalizer.ts` |
| Role classifier | `workspace/artifacts/api-server/src/modules/netops/bgp/bgp-role-classifier.ts` |
| DB schema | `workspace/lib/db/src/schema/bgp_peer_role_overrides.ts` |
| OpenAPI | `workspace/lib/api-spec/openapi.yaml` |
| Docs | `docs/netops/BGP_OPERATIONAL_ABSTRACTIONS.md` |
| TODOs | `reports/migration/FUTURE_PHASE_TODOS.md` |

## Endpoints criados / usados

```text
GET  /api/netops/devices/:id/bgp-peer-role-overrides
PUT  /api/netops/devices/:id/bgp-peers/:peerIp/role
GET  /api/netops/devices/:id/bgp-peers          (aplica override na leitura)
GET  /api/netops/devices/:id/bgp-peers/:peerIp  (stubs read-only por peer)
```

Body PUT role:

```json
{
  "addressFamily": "ipv4",
  "remoteAs": 65000,
  "role": "customer",
  "label": "opcional",
  "notes": "opcional"
}
```

## Tabela criada

`bgp_peer_role_overrides`

- Unique: `(device_id, peer_ip, address_family)`
- Roles: `customer|provider|ix|cdn|cdn_ix|ibgp|unknown`
- `source`: `manual_override`
- Sem senha, community SNMP ou segredo

Schema via Drizzle push (`pnpm --filter @workspace/db run push`).

## Precedencia de papel

```text
manual_override > classifier > snapshot/mock > unknown
```

`roleSource` exposto no peer: `manual_override | classifier | snapshot | unknown`.

## Frontend (painel BGP)

- Busca: placeholder `Buscar IP, ASN...`
- Filtro Estado: Todos, Established, Active, Idle, Connect
- Filtro Papel: Todos + roles operacionais
- Checkbox Incluir iBGP
- Contadores: total, established, eBGP, iBGP, clientes, operadoras, IX, CDN
- Tabela: Peer IP, Nome, ASN, Sessao/VRF, Estado, Uptime, Papel
- Select papel editavel + botao Salvar quando dirty
- Acoes por peer: read-only toast (Detalhes, Prefixos, Policies, Communities, Diagnostico)

## Logs locais

Ao salvar override, entrada derivada em `GET /api/netops/devices/:id/logs`:

- level `SUCCESS`, scope `BGP`, source `local`

## Limitacoes

- Nenhum comando VRP executado no dispositivo nesta fase.
- Acoes por peer (prefixos, policies, communities, diagnostico) ainda stub/toast.
- Filtros IPv4/IPv6 e `Down` na UI: pendente (API suporta `?af=` e `?state=Down`).
- Persistencia de filtros por dispositivo (estilo 60): pendente.
- Arvore BGP: faltam nos iBGP, Unknown, CDN/IX separados, sub-views IPv4/IPv6.

## Validacoes executadas

```bash
cd workspace && pnpm run typecheck                    # OK
BASE_PATH=/ PORT=5000 pnpm run build                  # OK
tools/netops-audit.sh                                 # OK
bash tools/apply-containers.sh api web                # OK (volume DB preservado)
```

Smoke API em `http://127.0.0.1:8085/api` (container `netops-api`):

| Teste | Resultado |
|-------|-----------|
| `GET /healthz` | `{"status":"ok"}` |
| `GET /netops/devices/1/bgp-peers` | `roleSource` presente (`unknown` antes override) |
| `PUT .../bgp-peers/10.20.0.13/role` body `customer` | HTTP 200, `source: manual_override` |
| `GET .../bgp-peers` apos PUT | `role: customer`, `roleSource: manual_override` |
| `GET .../bgp-peer-role-overrides` | 1 registro em `bgp_peer_role_overrides` |
| `GET http://127.0.0.1:3005/netops-operations` | HTTP 200 |

Nota: imagem anterior em `:8085` nao tinha rota PUT (404). Rebuild `api`/`web` via `apply-containers.sh` resolveu.

## Criterio de aceite

- [x] Busca, filtro estado, filtro papel, checkbox iBGP
- [x] Select papel + salvar dirty no banco local
- [x] Recarregar mantem papel (`manual_override`)
- [x] Contadores refletem papel salvo
- [x] Nenhuma config enviada ao roteador
- [x] Design global preservado
