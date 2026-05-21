# BGP Operational Abstractions

Fonte comportamental: `60-bgp_manager`.

Destino: `114-4WNET-NetOps`.

Regra principal: BGP nao e so tabela de vizinhos. BGP deve virar painel operacional por papel do peer, sem copiar layout do 60 e sem quebrar design atual do 114.

## Objetivo

Transformar o painel BGP em visao operacional segmentada por:

- Clientes
- Operadoras
- CDN
- IX
- iBGP
- Unknown

Cada categoria deve suportar peers IPv4 e IPv6.

## Regras

- Nao copiar layout do `60-bgp_manager`.
- Copiar comportamento, abstracoes, filtros e fluxos.
- Preservar tema, spacing, componentes e sidebar do 114.
- Tudo read-only nas fases iniciais.
- FASE 4 cria safety guard/adapters/parsers/botoes; coleta real somente na FASE 5.
- Nenhum comando destrutivo.
- Nenhum comando de configuracao.
- Nenhum apply.
- Nenhum commit/save.
- Nenhuma coleta SSH/SNMP real durante fase apenas de planejamento.

## Tipo Normalizado: BgpPeer

```ts
export type BgpPeerRole =
  | "provider"
  | "customer"
  | "cdn"
  | "ix"
  | "cdn_ix"
  | "ibgp"
  | "unknown";

export type AddressFamily = "ipv4" | "ipv6" | "unknown";

export type BgpPeerSource = "snmp" | "ssh" | "snapshot" | "mock";

export type BgpPeer = {
  peerIp: string;
  remoteAs: number | null;
  description: string | null;
  state: "Established" | "Idle" | "Active" | "Connect" | "Unknown";
  role: BgpPeerRole;
  addressFamily: AddressFamily;
  vrf: string | null;
  importPolicy: string | null;
  exportPolicy: string | null;
  receivedPrefixes: number | null;
  advertisedPrefixes: number | null;
  activePrefixes: number | null;
  uptime: string | null;
  source: BgpPeerSource;
};
```

Payload esperado:

```json
{
  "peerIp": "192.0.2.1",
  "remoteAs": 65000,
  "description": "CLIENTE XPTO",
  "state": "Established",
  "role": "customer",
  "addressFamily": "ipv4",
  "vrf": null,
  "importPolicy": "RP-IN-CLIENTE",
  "exportPolicy": "RP-OUT-CLIENTE",
  "receivedPrefixes": null,
  "advertisedPrefixes": null,
  "activePrefixes": null,
  "uptime": null,
  "source": "snapshot"
}
```

## Classificacao Obrigatoria

```text
provider  -> Operadoras
customer  -> Clientes
cdn       -> CDN
ix        -> IX
cdn_ix    -> CDN/IX quando nao for possivel separar
ibgp      -> iBGP
unknown   -> Nao classificado
```

Classificador deve ser defensivo:

- Preferir dado explicito do backend quando existir.
- Usar descricao, ASN, VRF, policy e padroes locais como hints.
- Nao forcar papel quando evidencia for fraca.
- Retornar `unknown` em caso duvidoso.

## Role Override Local (FASE 4.x)

Override de papel e classificacao operacional da plataforma. Nao altera configuracao BGP do dispositivo.

Tabela local:

```text
bgp_peer_role_overrides
- unique (device_id, peer_ip, address_family)
- role enum: customer|provider|ix|cdn|cdn_ix|ibgp|unknown
```

Endpoints:

```text
GET /api/netops/devices/:id/bgp-peer-role-overrides
PUT /api/netops/devices/:id/bgp-peers/:peerIp/role
```

Precedencia ao montar `GET /api/netops/devices/:id/bgp-peers`:

```text
manual_override > classifier > snapshot/mock > unknown
```

Campo `roleSource` no peer:

```text
manual_override | classifier | snapshot | unknown
```

Criterio classificador (quando sem override):

- `sessionType` iBGP -> `ibgp`
- descricao/nome/policy com CLIENTE -> `customer`
- OPERADORA/UPSTREAM/TRANSITO -> `provider`
- IX/PTT -> `ix`
- CDN/CACHE/GOOGLE/AKAMAI/META/NETFLIX -> `cdn`
- sem match -> `unknown`

Log operacional local ao salvar override:

```text
level: SUCCESS
scope: BGP
message: Papel do peer <peer> atualizado para <role>
source: local
```

Regra absoluta: nenhum comando VRP destrutivo ou de configuracao.

## IPv4 / IPv6

Todo peer deve identificar:

```text
addressFamily:
- ipv4
- ipv6
- unknown
```

Criterio:

- IPv4 se `peerIp` for IPv4.
- IPv6 se `peerIp` for IPv6.
- Unknown se parser nao conseguir determinar.

## Navegacao BGP

Arvore desejada:

```text
BGP
├── Todos
├── Operadoras
│   ├── IPv4
│   └── IPv6
├── Clientes
│   ├── IPv4
│   └── IPv6
├── CDN
│   ├── IPv4
│   └── IPv6
├── IX
│   ├── IPv4
│   └── IPv6
├── iBGP
└── Unknown
```

## Filtros no Frontend

FASE 4.x + 4.y no painel BGP (`bgp-panel.tsx`), sem mudar design global:

- Busca: IP, ASN, nome, VRF, policies
- Estado: Todos, Established, Active, Idle, Connect, **Down / Not Established** (`?state=Down` ou client-side)
- Address family: Todos, IPv4, IPv6, Unknown (`?af=ipv4|ipv6` ou client-side para unknown)
- Papel: Todos, Clientes, Operadoras, IX, CDN, CDN/IX, iBGP, Unknown (desabilitado quando no da arvore fixa role)
- Checkbox: Incluir iBGP
- Persistencia: `localStorage` chave `netops:bgp-filters:<deviceId>` (search, state, role, af, includeIbgp)
- Contadores: total, established, down, eBGP, iBGP, clientes, operadoras, IX, CDN, CDN/IX, unknown, IPv4, IPv6
- Papel editavel por linha (select) + Salvar (dirty) -> PUT role override local

Pendente fases futuras:

- Subnos IPv4/IPv6 por papel na arvore (60); 114 usa filtro AF no painel

## Acoes por Peer

Cada linha de peer BGP tem acoes read-only em **Sheet** (`bgp-peer-sheet.tsx`), nao toast:

- Detalhes (`useGetNetopsDeviceBgpPeer`)
- Prefixos recebidos (`useListNetopsDeviceBgpPeerReceivedPrefixes`)
- Prefixos exportados (`useListNetopsDeviceBgpPeerAdvertisedPrefixes`)
- Policies (`useGetNetopsDeviceBgpPeerPolicies`)
- Communities (`useGetNetopsDeviceBgpPeerCommunities`)
- Diagnostico (`useGetNetopsDeviceBgpPeerDiagnostics`)

Se backend retorna `[]` ou stub message, Sheet mostra empty state amigavel.

## Endpoints

Lista, filtros e override local (FASE 4.x):

```text
GET /api/netops/devices/:id/bgp-peer-role-overrides
PUT /api/netops/devices/:id/bgp-peers/:peerIp/role
GET /api/netops/devices/:id/bgp-peers
GET /api/netops/devices/:id/bgp-peers?role=customer
GET /api/netops/devices/:id/bgp-peers?role=provider
GET /api/netops/devices/:id/bgp-peers?role=cdn
GET /api/netops/devices/:id/bgp-peers?role=ix
GET /api/netops/devices/:id/bgp-peers?role=cdn_ix
GET /api/netops/devices/:id/bgp-peers?role=ibgp
GET /api/netops/devices/:id/bgp-peers?role=unknown
GET /api/netops/devices/:id/bgp-peers?af=ipv4
GET /api/netops/devices/:id/bgp-peers?af=ipv6
GET /api/netops/devices/:id/bgp-peers?state=Established
GET /api/netops/devices/:id/bgp-peers?state=Down
```

Detalhe operacional stub/read-only:

```text
GET /api/netops/devices/:id/bgp-peers/:peerIp
GET /api/netops/devices/:id/bgp-peers/:peerIp/received-prefixes
GET /api/netops/devices/:id/bgp-peers/:peerIp/advertised-prefixes
GET /api/netops/devices/:id/bgp-peers/:peerIp/policies
GET /api/netops/devices/:id/bgp-peers/:peerIp/communities
GET /api/netops/devices/:id/bgp-peers/:peerIp/diagnostics
```

Coleta read-only SNMP na FASE 5 (`NETOPS_SNMP_REAL_ENABLED`, default `false`):

```text
POST /api/netops/devices/:id/collect/read-only
GET /api/netops/devices/:id/collection-status
```

Detalhes SNMP: `docs/netops/SNMP_READONLY_COLLECTION.md`.

SSH read-only real permanece fase posterior.

## Comandos Huawei VRP Permitidos Futuramente

Somente read-only:

```text
display bgp peer
display bgp ipv6 peer
display bgp routing-table peer <PEER> received-routes
display bgp routing-table peer <PEER> advertised-routes
display bgp ipv6 routing-table peer <PEER> received-routes
display bgp ipv6 routing-table peer <PEER> advertised-routes
display current-configuration configuration bgp
display current-configuration | include <PEER>
display interface
display ip interface brief
display ipv6 interface brief
display route-policy
display ip ip-prefix
display ip community-filter
```

## Comandos Proibidos

```text
system-view
commit
save
undo
reset bgp
refresh bgp
clear bgp
configure terminal
peer ... enable
peer ... route-policy
route-policy ...
ip ip-prefix ...
ip community-filter ...
```

## Implementacao FASE 4

- Safety guard: `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/commands.ts`.
- Adapter SNMP read-only: `workspace/artifacts/api-server/src/modules/netops/adapters/snmp-readonly-adapter.ts`.
- Coletor IF-MIB/BGP4-MIB: `workspace/artifacts/api-server/src/modules/netops/snmp/`.
- Adapter SSH stub: `workspace/artifacts/api-server/src/modules/netops/adapters/ssh-readonly-adapter.ts`.
- Parsers Huawei VRP iniciais: `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers`.
- Normalizador BGP: `workspace/artifacts/api-server/src/modules/netops/bgp/bgp-normalizer.ts`.
- Classificadores BGP: `workspace/artifacts/api-server/src/modules/netops/bgp`.
- Painel BGP + filtros: `workspace/artifacts/netops-manager/src/features/bgp/bgp-panel.tsx`.
- Sheet acoes peer: `workspace/artifacts/netops-manager/src/features/bgp/bgp-peer-sheet.tsx`.
- Arvore operacional BGP: `workspace/artifacts/netops-manager/src/features/netops-tree/`.

## Criterio de Aceite

- BGP separado por Cliente, Operadora, CDN, IX, iBGP e Unknown.
- IPv4 e IPv6 identificados.
- Botoes de prefixos recebidos e exportados aparecem.
- Policies, communities e diagnostico aparecem como acoes read-only.
- Se ainda nao houver backend real, mostrar estado vazio amigavel.
- Nenhum comando altera estado.
- Design atual preservado.
