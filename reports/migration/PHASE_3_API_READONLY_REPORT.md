# Phase 3 - API Read-Only Report

## Endpoints criados

- `GET /api/netops/devices/:id/summary`
- `GET /api/netops/devices/:id/interfaces`
- `GET /api/netops/devices/:id/bgp-peers`
- `GET /api/netops/devices/:id/bgp-peers?role=provider`
- `GET /api/netops/devices/:id/bgp-peers?role=customer`
- `GET /api/netops/devices/:id/bgp-peers?role=cdn_ix`
- `GET /api/netops/devices/:id/filters`
- `GET /api/netops/devices/:id/communities`
- `GET /api/netops/devices/:id/logs`
- `GET /api/netops/devices/:id/snmp-snapshots/latest`

## Arquivos alterados

- `workspace/artifacts/api-server/src/modules/netops/routes.ts`
- `workspace/artifacts/api-server/src/modules/netops/service.ts`
- `workspace/artifacts/api-server/src/modules/netops/types.ts`
- `workspace/artifacts/api-server/src/modules/netops/adapters/snapshot-adapter.ts`
- `workspace/artifacts/api-server/src/modules/netops/adapters/mock-adapter.ts`
- `workspace/artifacts/api-server/src/modules/netops/classifiers/bgp-role-classifier.ts`
- `workspace/artifacts/api-server/src/routes/index.ts`
- `workspace/lib/api-spec/openapi.yaml`
- `workspace/lib/api-spec/package.json`
- `workspace/lib/api-spec/fix-zod-index.mjs`
- `workspace/lib/api-client-react/src/generated/*`
- `workspace/lib/api-zod/src/generated/*`
- `workspace/lib/api-zod/src/index.ts`
- `workspace/artifacts/netops-manager/src/pages/netops-operations.tsx`
- `workspace/artifacts/netops-manager/src/features/device-inventory/operational-summary.tsx`
- `workspace/artifacts/netops-manager/src/features/device-inventory/interfaces-panel.tsx`
- `workspace/artifacts/netops-manager/src/features/device-inventory/operational-logs-panel.tsx`
- `workspace/artifacts/netops-manager/src/features/bgp/bgp-panel.tsx`
- `workspace/artifacts/netops-manager/src/features/bgp/filters-panel.tsx`
- `workspace/artifacts/netops-manager/src/features/communities/communities-placeholder-panel.tsx`
- `reports/migration/FUTURE_PHASE_TODOS.md`

## Decisoes

- Caminho real usado: `workspace/artifacts/api-server/src/modules/netops`, pois o projeto nao possui `workspace/server`.
- APIs sao read-only e nao chamam SSH/SNMP real.
- Fonte inicial: ultimo registro de `snmp_snapshots`.
- Se nao houver snapshot, endpoints retornam arrays vazios e mensagem amigavel no endpoint de latest snapshot.
- `device` retornado em summary nao inclui `passwordEncrypted`, `snmpCommunity` ou credenciais.
- BGP role usa classificador defensivo por descricao/nome quando existir dado no snapshot.
- BGP peer IP em hex ASCII vindo de snapshot legado e normalizado em runtime, sem alterar banco.
- `api-zod` root exporta apenas validadores Zod para evitar conflito entre nomes de validadores e tipos gerados.

## Limitacoes

- `filters` e `communities` ainda retornam vazio porque nao ha parser read-only ligado nesta fase.
- Classificacao BGP depende do conteudo presente em snapshot JSON.
- Logs sao sinteticos a partir do ultimo snapshot; ainda nao ha storage de logs operacionais dedicado.
- Paineis reais mostram tabelas, empty state e error state, mas dados dependem dos snapshots existentes.
- Classificacao por role ainda pode retornar vazio para `provider/customer/cdn_ix` quando snapshot nao traz descricao/policy.

## Proximos passos

- FASE 4: adapters SNMP/SSH read-only com regra `show/display` somente.
- FASE 5: parsers Huawei VRP com fixtures e testes.
- FASE 6: paineis reais completos com filtros, communities e metricas.
- FASE 7+: pre-check, plano, aprovacao humana, apply controlado e pos-validacao.
