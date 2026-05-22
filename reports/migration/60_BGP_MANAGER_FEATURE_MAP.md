# 60-bgp_manager Feature Map

## Existe no 60-bgp_manager

- Arvore operacional por empresa/cliente e dispositivo.
- Subviews por dispositivo: Interfaces, BGP, Operadoras, Clientes, CDN/IX, Filtros, Communities.
- Coleta SNMP completa de interfaces, BGP peers e VRFs.
- Refresh SNMP leve para admin/oper de interfaces e estado/counters BGP.
- SSH Huawei VRP para coleta de running-config e consultas operacionais.
- Parsers Huawei VRP para interfaces, BGP, VRFs, route-policy e communities.
- Classificacao BGP por papel: operadora, cliente, CDN/IX, iBGP/eBGP.
- Painel de logs operacionais com eventos SNMP, SSH, startup, warning/error/success.
- Fluxos sensiveis de communities e policies com preview antes de aplicar.

## Ja existe no 114-4WNET-NetOps

- Frontend React/Vite/Wouter com shadcn/ui e tema dark.
- Inventario de dispositivos.
- Cadastro/edicao com SSH e `snmpCommunity`.
- Teste SSH.
- Coleta SSH de configuracao e parsing inicial.
- Tabela `snmp_snapshots`.
- Poller SNMP persistindo interfaces, BGP peers e VRFs em JSON.
- API e tela de historico SNMP: `/api/snmp-snapshots` e `SNMP History`.
- Discovery BGP agora e VRF-aware: coleta SSH cobre `display bgp peer verbose`, `display bgp ipv6 peer verbose`, `vpnv4` e `vpnv6` por `vpn-instance`.
- Override local de papel BGP ja persistido em `bgp_peer_role_overrides`, com `manual_override > classifier > snapshot > customer(default)`.
- OpenAPI, Orval e Zod.
- CI com typecheck, build e smoke Docker.

## Sera portado/adaptado depois

- API read-only por device:
  - `GET /api/devices/:id/interfaces`
  - `GET /api/devices/:id/bgp-peers`
  - `GET /api/devices/:id/bgp-peers?role=provider`
  - `GET /api/devices/:id/bgp-peers?role=customer`
  - `GET /api/devices/:id/bgp-peers?role=cdn_ix`
  - `GET /api/devices/:id/communities`
  - `GET /api/devices/:id/filters`
  - `GET /api/devices/:id/snmp-snapshots/latest`
- Modulos TypeScript separados para SNMP, SSH, Huawei VRP, BGP, interfaces e communities.
- Parsers Huawei VRP mais completos.
- Classificacao BGP por papel, preservando schema atual ate haver migracao controlada.
- Logs operacionais normalizados.
- Paineis reais ligados nas APIs read-only.

## Descartado nesta etapa

- Copia literal do frontend do 60.
- Copia direta de Python para backend TypeScript.
- Operacoes write/apply de route-policy ou communities.
- Mudanca de tema, spacing, tokens, sidebar global ou design system.
- Migracao de banco para tabelas novas.
- SNMP/SSH runtime novo.

## Riscos

- 60 usa Python/FastAPI/SQLAlchemy; 114 usa Express/TypeScript/Drizzle.
- 60 tem modelo persistido rico para interfaces/BGP; 114 hoje usa snapshots JSON.
- Classificacao BGP precisa regra defensiva para evitar papel incorreto.
- Huawei VRP tem saidas variantes por plataforma e versao.
- APIs read-only devem nascer sem quebrar contratos existentes.
- UI operacional pode crescer demais; precisa manter densidade e padrao visual atual.
- Override de papel BGP nao usa `unknown` como categoria visivel; `unknown` fica como fallback interno apenas.

## Proxima etapa implementada agora

- Arvore operacional visual dentro do layout atual.
- Placeholders funcionais para Interfaces, BGP, Operadoras, Clientes, CDN/IX, Filters e Communities.
- Nenhuma integracao SNMP/SSH nova nesta etapa.

## Discovery read-only implementado depois da etapa visual

- `POST /api/devices/:id/discover`
- `GET /api/devices/:id/discovery-snapshot`
- `GET /api/devices/:id/bgp/peers?category=customer`
- `GET /api/devices/:id/bgp/peers/:peerIp/details`
- `POST /api/devices/:id/bgp/peers/:peerIp/routes/query`
  - Consulta SSH viva de prefixos recebidos/anunciados com limite maximo de 200 itens por pagina, suporte a `page` e `offset`, aviso de alto volume e persistencia de historico.
- Frontend BGP passa a consumir objetos estruturados de discovery.
- Persistencia local adicionada em `discovery_runs`, `discovery_snapshots` e `discovery_evidence`.
- OpenAPI/Orval atualizado para os endpoints de discovery.
- Parser Huawei VRP cobre primeira melhoria de route-policy nodes, community-filter/list e L2VC/VSI basico.
- Ainda pendente: parser Huawei VRP completo para variantes adicionais de plataforma/versao.

## Compliance grouping UI v0.2.8

- `/compliance` consome `GET /api/compliance-findings-groups` via cliente OpenAPI/Orval.
- UI alterna entre lista de findings e grupos de findings.
- Cards de agrupamento destacam top criticos, top por quantidade, bloqueadores reais e riscos operacionais.
- Drawer de grupo mostra findings associados, objetos afetados e evidencias sanitizadas.

## Compliance freshness v0.2.9

- Findings novos carregam `complianceEngineVersion`, `parserVersion` e `parserVersions.interface` em metadata.
- `/api/compliance-findings` e `/api/compliance-findings-groups` aceitam `latestJobOnly` e `freshness`.
- `/api/compliance-findings-freshness-summary` separa current, stale, legacy e superseded.
- `/compliance` oculta historico por padrao e mostra toggle explicito para incluir findings antigos.
