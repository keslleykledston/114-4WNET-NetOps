# Phase 4 Read-only Adapters Report

## Escopo

FASE 4 adiciona contratos e protecoes read-only para SNMP/SSH, parsers Huawei VRP iniciais, normalizacao BGP e botoes read-only por peer.

Coleta real nao foi habilitada nesta fase. FASE 5 deve tratar execucao real controlada read-only.

## Arquivos principais

- `workspace/artifacts/api-server/src/modules/netops/adapters/adapter-types.ts`
- `workspace/artifacts/api-server/src/modules/netops/adapters/snmp-readonly-adapter.ts`
- `workspace/artifacts/api-server/src/modules/netops/adapters/ssh-readonly-adapter.ts`
- `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/commands.ts`
- `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/bgp-peer-parser.ts`
- `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/interface-parser.ts`
- `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/vrf-parser.ts`
- `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-parser.ts`
- `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/community-parser.ts`
- `workspace/artifacts/api-server/src/modules/netops/bgp/bgp-role-classifier.ts`
- `workspace/artifacts/api-server/src/modules/netops/bgp/bgp-af-classifier.ts`
- `workspace/artifacts/api-server/src/modules/netops/bgp/bgp-normalizer.ts`
- `workspace/artifacts/api-server/src/modules/netops/routes.ts`
- `workspace/artifacts/api-server/src/modules/netops/service.ts`
- `workspace/artifacts/netops-manager/src/features/bgp/bgp-panel.tsx`
- `workspace/lib/api-spec/openapi.yaml`

## Safety guard

Criado `validateReadonlyCommand(command)`.

Permite somente comandos `display/show` em allowlist Huawei VRP.

Bloqueia:

- `system-view`
- `configure terminal`
- `commit`
- `save`
- `undo`
- `reset`
- `clear bgp`
- `refresh bgp`
- comandos `peer ... enable`
- comandos `peer ... route-policy`
- escrita de `route-policy`
- escrita de `ip ip-prefix`
- escrita de `ip community-filter`

## Adapters

### SNMP

`SnmpReadonlyAdapter` existe como contrato stub.

Nao executa GET/WALK real na FASE 4.

Retorna estado `blocked`, arrays vazios e log operacional informativo.

### SSH

`SshReadonlyAdapter` valida comandos pela allowlist.

Nao executa SSH real na FASE 4, mesmo se comandos forem validos.

Retorna `ready` quando comandos passam no guard e `executed=false`.

## Parsers Huawei VRP

Parsers iniciais criados para:

- BGP peers
- interfaces
- VRFs
- route-policy/ip-prefix
- community-filter

Limitacao: parsers sao iniciais. FASE 5 deve adicionar fixtures reais do 60 e testes antes de confiar em producao.

## BGP

Normalizador BGP agora suporta:

- `role`: `provider | customer | cdn | ix | cdn_ix | ibgp | unknown`
- `addressFamily`: `ipv4 | ipv6 | unknown`
- `vrf`
- `receivedPrefixes`
- `advertisedPrefixes`
- `activePrefixes`
- `source`: `snmp | ssh | snapshot | mock | db`

## APIs

Novas/expandidas:

- `GET /api/netops/devices/:id/bgp-peers?role=...`
- `GET /api/netops/devices/:id/bgp-peers?af=ipv4|ipv6`
- `GET /api/netops/devices/:id/bgp-peers?state=Established|Down`
- `POST /api/netops/devices/:id/collect/read-only`
- `GET /api/netops/devices/:id/collection-status`
- `GET /api/netops/devices/:id/bgp-peers/:peerIp`
- `GET /api/netops/devices/:id/bgp-peers/:peerIp/received-prefixes`
- `GET /api/netops/devices/:id/bgp-peers/:peerIp/advertised-prefixes`
- `GET /api/netops/devices/:id/bgp-peers/:peerIp/policies`
- `GET /api/netops/devices/:id/bgp-peers/:peerIp/communities`
- `GET /api/netops/devices/:id/bgp-peers/:peerIp/diagnostics`

Detalhes/prefixos/policies/communities/diagnostics usam dados de snapshot/stub. Nenhum comando em roteador.

## Frontend

Painel BGP ganhou botoes read-only por peer:

- Detalhes
- Recebidos
- Exportados
- Policies
- Communities
- Diagnostico

Na FASE 4, botoes aparecem desabilitados como superficie visual segura. FASE 6 deve ligar modais/drawers aos endpoints.

## Decisoes

- Nao executar SSH real na FASE 4.
- Nao executar SNMP real na FASE 4.
- Nao persistir snapshot novo na FASE 4.
- Reutilizar snapshot existente para manter FASE 3 funcionando.
- Expandir OpenAPI/Orval/Zod para preparar chamadas futuras.

## Proximos passos

- FASE 4.1: migrar favicon/icone K3G.
- FASE 5: habilitar coleta real controlada read-only atras de flag/config.
- FASE 5: adicionar fixtures reais Huawei VRP do 60 e testes de parser.
- FASE 6: ligar botoes BGP a modais/drawers e dados reais.
