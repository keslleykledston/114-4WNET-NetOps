# Future Phase TODOs

## Estado atual

- FASE 0 concluida: auditoria frontend e relatorio baseline.
- FASE 1 concluida: UX guardrails.
- FASE 2 concluida: arvore operacional com placeholders, sem mudar layout global.
- FASE 3 concluida: APIs read-only, frontend ligado, container aplicado.
- FASE 4 concluida: safety guard, adapters SNMP/SSH read-only stub, parsers Huawei VRP iniciais, botoes BGP, containers aplicados.
- FASE 4.x concluida: filtros BGP no painel (busca, estado, papel, iBGP), role override local (`bgp_peer_role_overrides`), precedencia `manual_override > classifier > snapshot`.
- FASE 4.y concluida: AF filter, Down state, localStorage por device, arvore BGP expandida (CDN/IX/iBGP/Unknown), Sheet peer actions, contadores 12, relatorio `PHASE_4Y_BGP_UX_PARITY_REPORT.md`.
- FASE 4.1 pendente: migrar favicon/icone K3G do `60-bgp_manager`.
- FASE 5+ pendente: coleta real controlada read-only, paineis BGP completos, pre-check de servico, plano de configuracao com aprovacao humana.

# BGP Operational Abstractions — vindo do 60-bgp_manager

Nas proximas fases, abstrair do projeto 60-bgp_manager as funcionalidades operacionais de BGP, mantendo o design atual do 114-4WNET-NetOps.

## Objetivo

Transformar o painel BGP em uma visao operacional segmentada por papel do peer:

- Clientes
- Operadoras
- CDN
- IX
- iBGP
- Unknown

Cada categoria deve suportar peers IPv4 e IPv6.

## Regras

- Nao copiar layout do 60-bgp_manager.
- Copiar comportamento, abstracoes, filtros e fluxos.
- Preservar design atual.
- Tudo read-only nas fases iniciais.
- Nenhum comando destrutivo.
- Nenhum comando de configuracao.
- Nenhum apply.
- Nenhum commit/save.

## Campos normalizados do Peer BGP

Cada peer deve ser normalizado no backend como:

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
  "source": "snmp|ssh|snapshot|mock"
}
```

## Classificacao obrigatoria

Implementar classificador de role:

```text
provider  -> Operadoras
customer  -> Clientes
cdn       -> CDN
ix        -> IX
cdn_ix    -> CDN/IX quando nao for possivel separar
ibgp      -> iBGP
unknown   -> Nao classificado
```

## IPv4 / IPv6

Todo peer deve identificar:

```text
addressFamily:
- ipv4
- ipv6
- unknown
```

Criterio:

- IPv4 se peerIp for IPv4.
- IPv6 se peerIp for IPv6.
- Unknown se parser nao conseguir determinar.

## Filtros no frontend

Adicionar filtros:

- Todos
- Established
- Down
- IPv4
- IPv6
- Clientes
- Operadoras
- CDN
- IX
- iBGP
- Unknown

## Botoes por peer

Cada linha/card de peer BGP deve ter acoes read-only:

- Detalhes
- Prefixos recebidos
- Prefixos exportados/anunciados
- Policies
- Communities
- Diagnostico

## Endpoints futuros

Criar ou planejar:

```text
GET /api/netops/devices/:id/bgp-peers
GET /api/netops/devices/:id/bgp-peers?role=customer
GET /api/netops/devices/:id/bgp-peers?role=provider
GET /api/netops/devices/:id/bgp-peers?role=cdn
GET /api/netops/devices/:id/bgp-peers?role=ix
GET /api/netops/devices/:id/bgp-peers?af=ipv4
GET /api/netops/devices/:id/bgp-peers?af=ipv6

GET /api/netops/devices/:id/bgp-peers/:peerIp
GET /api/netops/devices/:id/bgp-peers/:peerIp/received-prefixes
GET /api/netops/devices/:id/bgp-peers/:peerIp/advertised-prefixes
GET /api/netops/devices/:id/bgp-peers/:peerIp/policies
GET /api/netops/devices/:id/bgp-peers/:peerIp/communities
GET /api/netops/devices/:id/bgp-peers/:peerIp/diagnostics
```

## Comandos Huawei VRP permitidos futuramente

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
display route-policy
display ip ip-prefix
display ip community-filter
```

## Comandos proibidos

```text
system-view
commit
save
undo
reset bgp
refresh bgp
clear bgp
peer ... enable
peer ... route-policy
route-policy ...
ip ip-prefix ...
ip community-filter ...
```

## Criterio de aceite

- BGP separado por Cliente, Operadora, CDN, IX.
- IPv4 e IPv6 identificados.
- Botoes de prefixos recebidos e exportados aparecem.
- Se ainda nao houver backend real, mostrar estado vazio amigavel.
- Nenhum comando altera estado.
- Design atual preservado.

## Prompt para proximo agente

```text
MODO CAVEMAN.

Atualize o plano das proximas fases para incluir abstracoes BGP vindas do 60-bgp_manager.

Objetivo:
Trazer para o 114-4WNET-NetOps os filtros e comportamentos BGP operacionais do 60-bgp_manager, sem quebrar o design atual.

Escopo:
- Clientes
- Operadoras
- CDN
- IX
- CDN/IX
- iBGP
- Unknown
- IPv4
- IPv6
- Prefixos recebidos
- Prefixos exportados/anunciados
- Policies import/export
- Communities
- Diagnostico read-only

Nao implementar coleta real ainda se a fase atual for so planejamento.
Nao executar SSH real.
Nao executar SNMP real.
Nao alterar roteador.
Nao mexer em configuracao.

Acoes:
1. Atualizar reports/migration/FUTURE_PHASE_TODOS.md.
2. Criar docs/netops/BGP_OPERATIONAL_ABSTRACTIONS.md.
3. Definir tipo normalizado BgpPeer.
4. Definir tipo BgpPeerRole.
5. Definir tipo AddressFamily.
6. Definir endpoints planejados.
7. Definir botoes frontend por peer.
8. Definir comandos Huawei VRP permitidos somente read-only.
9. Definir comandos proibidos.
10. Preservar UX_GUARDRAILS.md.

Criterio:
- Documento claro.
- Sem alteracao destrutiva.
- Sem mudanca visual.
- Sem backend real ainda, exceto se ja houver FASE 3 aprovada.
```

## Decisao

Para as proximas fases, o BGP deve virar isto:

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

E cada peer precisa abrir:

```text
Detalhes
Prefixos recebidos
Prefixos exportados
Policies
Communities
Diagnostico
```

## FASE 3 - APIs read-only

Objetivo: expor dados operacionais sem alterar schema destrutivamente.

- [x] FASE 3 iniciada.
- [x] Criar contratos OpenAPI para:
  - [x] `GET /api/netops/devices/:id/summary`
  - [x] `GET /api/netops/devices/:id/interfaces`
  - [x] `GET /api/netops/devices/:id/bgp-peers`
  - [x] `GET /api/netops/devices/:id/bgp-peers?role=provider`
  - [x] `GET /api/netops/devices/:id/bgp-peers?role=customer`
  - [x] `GET /api/netops/devices/:id/bgp-peers?role=cdn_ix`
  - [x] `GET /api/netops/devices/:id/communities`
  - [x] `GET /api/netops/devices/:id/filters`
  - [x] `GET /api/netops/devices/:id/logs`
  - [x] `GET /api/netops/devices/:id/snmp-snapshots/latest`
- [x] Implementar rotas Express read-only.
- [x] Usar `snmp_snapshots` como fonte inicial para interfaces/BGP/VRFs.
- [x] Gerar Orval/Zod.
- [x] Ligar placeholders ao client gerado.
- [x] Validar `pnpm run typecheck`.
- [x] Validar `BASE_PATH=/ PORT=5000 pnpm run build`.
- [x] Aplicar ao container `api web` sem remover volume de banco.
- [x] Reaplicar ajuste backend ao container `api` sem remover volume de banco.
- [x] Smoke test em `/api/netops/devices/1/summary`.
- [x] Smoke test em `/api/netops/devices/1/bgp-peers`.
- [x] Smoke test em `/netops-operations`.
- [x] Confirmar banco preservado via count de `devices`.
- [x] FASE 3 concluida.

## FASE 4 - Adapters SNMP/SSH read-only

Objetivo: criar safety guard, contratos de adapters, parsers iniciais e botoes BGP. Nao executar coleta real nesta fase.

- [x] Adicionar fallback SSH `keyboard-interactive` para login Huawei/VRP.
- [x] Manter FASE 4 read-only estrita:
  - [x] permitir somente comandos `show`/`display` em allowlist.
  - [x] proibir `system-view`.
  - [x] proibir `configure terminal`.
  - [x] proibir `commit`.
  - [x] proibir `save`.
  - [x] proibir `undo`.
  - [x] proibir `reset`.
  - [x] proibir `clear bgp`.
  - [x] proibir `refresh bgp`.
- [x] Criar modulos TypeScript conforme arquitetura real do 114:
  - [x] `workspace/artifacts/api-server/src/modules/netops/adapters/snmp-readonly-adapter.ts`
  - [x] `workspace/artifacts/api-server/src/modules/netops/adapters/ssh-readonly-adapter.ts`
  - [x] `workspace/artifacts/api-server/src/modules/netops/adapters/adapter-types.ts`
  - [x] `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/commands.ts`
  - [x] `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/*`
  - [x] `workspace/artifacts/api-server/src/modules/netops/bgp/*`
- [x] Adaptar parsers Huawei VRP iniciais:
  - [x] BGP peers.
  - [x] interfaces.
  - [x] VRFs.
  - [x] route-policy/ip-prefix.
  - [x] community-filter.
- [ ] Adicionar diagnostico SSH detalhado por etapa na FASE 5:
  - [ ] TCP connect
  - [ ] handshake
  - [ ] auth methods offered
  - [ ] shell/exec ready
- [x] Implementar fallback IPv6 para peers via `addressFamily`.
- [x] Criar classificacao defensiva de BGP:
  - [x] provider
  - [x] customer
  - [x] cdn
  - [x] ix
  - [x] cdn_ix
  - [x] ibgp
  - [x] unknown
- [x] Expandir tipo normalizado `BgpPeer`:
  - [x] `vrf`
  - [x] `receivedPrefixes`
  - [x] `advertisedPrefixes`
  - [x] `activePrefixes`
  - [x] `source` como `snmp|ssh|snapshot|mock|db`
- [x] Adicionar filtros read-only por `role`, `af`, `state`.
- [x] Criar endpoints stub de detalhe por peer:
  - [x] `/bgp-peers/:peerIp`
  - [x] `/bgp-peers/:peerIp/received-prefixes`
  - [x] `/bgp-peers/:peerIp/advertised-prefixes`
  - [x] `/bgp-peers/:peerIp/policies`
  - [x] `/bgp-peers/:peerIp/communities`
  - [x] `/bgp-peers/:peerIp/diagnostics`
- [x] Criar endpoints de coleta/status stub:
  - [x] `POST /api/netops/devices/:id/collect/read-only`
  - [x] `GET /api/netops/devices/:id/collection-status`
- [x] Adicionar botoes BGP read-only no frontend.
- [x] Gerar OpenAPI/Orval/Zod.
- [x] Validar `pnpm run typecheck`.
- [x] Validar `BASE_PATH=/ PORT=5000 pnpm run build`.
- [x] Validar `tools/netops-audit.sh`.
- [x] Aplicar containers `api web` sem remover volume de banco.
- [x] Smoke `/netops-operations`.
- [x] Smoke APIs FASE 3/4.
- [x] Confirmar comandos destrutivos aparecem somente no denylist do safety guard/docs.
- [x] FASE 4 concluida.

## FASE 4.1 - Identidade K3G controlada

Objetivo: migrar favicon/icone K3G do `60-bgp_manager` sem trocar layout, tema ou padrao visual.

- [ ] Localizar assets no `60-bgp_manager`:
  - [ ] `../60-bgp_manager/frontend/public/favicon-light.png`
  - [ ] `../60-bgp_manager/frontend/public/favicon-dark.png`
  - [ ] `../60-bgp_manager/frontend/public/apple-touch-icon-light.png`
  - [ ] `../60-bgp_manager/frontend/public/apple-touch-icon-dark.png`
  - [ ] confirmar se existe logo/icone K3G adicional fora de `public`.
- [ ] Registrar origem, destino e decisao em `reports/migration/K3G_ASSETS_MIGRATION_PLAN.md`.
- [ ] Copiar/adaptar assets com nomes claros.
- [ ] Nao sobrescrever `favicon.svg`/`opengraph.jpg` sem backup.
- [ ] Aplicar favicon na aba do navegador.
- [ ] Aplicar icone K3G discreto na dashboard ou sidebar conforme padrao atual.
- [ ] Validar typecheck/build/audit e aplicar container `web`.

## FASE 5 - Coleta real controlada read-only

- [x] Habilitar SNMP GET/WALK real atras de flag/config segura (`NETOPS_SNMP_REAL_ENABLED`, default false).
- [ ] Habilitar SSH real atras de flag/config segura.
- [ ] Executar somente allowlist `display/show` (SSH — FASE 5.1).
- [x] Persistir snapshot em `snmp_snapshots` via collect/read-only.
- [x] Logs operacionais SNMP em collect + GET logs (snapshot message).
- [ ] Diagnostico SSH detalhado por etapa:
  - [ ] TCP connect
  - [ ] handshake
  - [ ] auth methods offered
  - [ ] shell/exec ready
- [ ] Nenhum comando altera estado.

## FASE 6 - Paineis BGP completos

- [ ] Interfaces: listar nome, admin/oper, alias, speed, IPv4/IPv6, counters.
- [ ] BGP geral: peer, ASN, VRF, state, role, address family, policies.
- [ ] BGP Todos: listar peers IPv4/IPv6 com filtros por estado e papel.
- [ ] BGP Operadoras: filtro `role=provider`.
- [ ] BGP Clientes: filtro `role=customer`.
- [ ] BGP CDN: filtro `role=cdn`.
- [ ] BGP IX: filtro `role=ix`.
- [ ] BGP CDN/IX legado: filtro `role=cdn_ix` quando nao for possivel separar.
- [ ] BGP iBGP: filtro `role=ibgp`.
- [ ] BGP Unknown: filtro `role=unknown`.
- [ ] Modais/drawers read-only por peer:
  - [ ] Detalhes
  - [ ] Prefixos recebidos
  - [ ] Prefixos exportados/anunciados
  - [ ] Policies
  - [ ] Communities
  - [ ] Diagnostico
- [ ] Filters: route-policy, prefix-filter e community-filter detectados.
- [ ] Communities: community-filter, community-list, apply community refs.

## Validacao continua por fase

- [ ] Screenshot desktop da rota `/netops-operations`.
- [ ] Screenshot mobile/tablet se layout for alterado.
- [ ] Confirmar sidebar global intacta.
- [ ] Confirmar rotas antigas intactas.
- [ ] `pnpm run typecheck`.
- [ ] `BASE_PATH=/ PORT=5000 pnpm run build`.
- [ ] `docker compose config`.
- [ ] `docker build --pull --no-cache -t netops-manager-ci .`.

## FASE 7 - Pre-check de servico

- [ ] Validar conectividade e permissao read-only.
- [ ] Validar comandos permitidos por vendor.
- [ ] Validar backup/snapshot antes de qualquer plano write futuro.

## FASE 8 - Plano de configuracao

- [ ] Gerar plano textual.
- [ ] Gerar diff/comandos previstos.
- [ ] Nao executar comandos.

## FASE 9 - Aprovacao humana

- [ ] Exigir aprovacao explicita.
- [ ] Registrar operador, alvo, comandos e janela.

## FASE 10 - Apply controlado

- [ ] Executar somente apos FASE 9.
- [ ] Usar timeout e parada em erro.
- [ ] Nao salvar config automaticamente sem regra explicita.

## FASE 11 - Pos-validacao

- [ ] Validar estado operacional.
- [ ] Comparar antes/depois.
- [ ] Registrar logs e resultado.

## Regras para outros agentes

- Nao copiar frontend do `60-bgp_manager`.
- Nao copiar Python para TypeScript.
- Nao trocar tema ou tokens CSS.
- Nao remover rotas ou componentes existentes.
- Nao sobrescrever assets existentes sem backup ou novo nome claro.
- Nao criar migrations destrutivas.
- Toda alteracao de runtime deve ser aplicada ao container especifico antes de encerrar a tarefa.
- Nunca usar `docker compose down -v`, `docker volume rm`, reset de banco ou apagar migrations sem pedido explicito e backup confirmado.
- Antes de FASE 4, escrever testes/fixtures para parser.
- Antes de qualquer acao SSH write, exigir preview, auditoria e confirmacao explicita.
