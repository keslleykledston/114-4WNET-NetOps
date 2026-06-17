# KGS-54 — Análise da lógica da sessão NetOps Operation > [DEVICE] > BGP > Anúncios (Matriz)

## Escopo

Análise do caminho de execução da view `bgp-announcements` em `NetOps Operations`, cobrindo navegação, frontend, API, regras de negócio, persistência e riscos operacionais.

## Resumo executivo

A sessão `Anúncios (matriz)` é uma view operacional de observação e simulação sobre snapshots/config coletados, mas ela não é puramente read-only no banco. O caminho de leitura da matriz recalcula e persiste artefatos auxiliares (`bgp_announcement_targets`, `bgp_community_sets`, `bgp_upstream_circuits`) a cada carga ou atualização de dados.

O recorte funcional atual é:

- árvore `NetOps Operations` seleciona a view `bgp-announcements`;
- o frontend carrega matriz, evidência, auditoria de upstream, `community sets` e `change plans`;
- a API monta a matriz a partir de `discovery_snapshot` ou `collected_config`;
- apenas targets classificados como `origin_target` e `customer_import_target` entram na matriz;
- `preview` e `change plan` existem, mas execução real continua bloqueada por flags.

## Fluxo de execução

### 1. Entrada da tela

- A árvore do NetOps expõe a opção `Anúncios (matriz)` como subitem de `BGP` em [workspace/artifacts/netops-manager/src/features/netops-tree/netops-tree.tsx](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/netops-manager/src/features/netops-tree/netops-tree.tsx:194).
- A seleção da view `bgp-announcements` é tipada em [workspace/artifacts/netops-manager/src/features/netops-tree/types.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/netops-manager/src/features/netops-tree/types.ts:7).
- `NetopsOperations` renderiza `AnnouncementPanel` quando a view ativa é `bgp-announcements` em [workspace/artifacts/netops-manager/src/pages/netops-operations.tsx](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/netops-manager/src/pages/netops-operations.tsx:476).
- A rota dedicada `/bgp/announcements` apenas redireciona para `/netops-operations?view=bgp-announcements` em [workspace/artifacts/netops-manager/src/pages/bgp-announcements.tsx](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/netops-manager/src/pages/bgp-announcements.tsx:1).

### 2. Queries do frontend

`AnnouncementPanel` dispara cinco consultas principais em [workspace/artifacts/netops-manager/src/features/bgp-announcements/AnnouncementPanel.tsx](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/netops-manager/src/features/bgp-announcements/AnnouncementPanel.tsx:42):

- `fetchAnnouncementMatrix`
- `fetchTargetEvidence`
- `fetchUpstreamAudit`
- `fetchCommunitySets`
- `fetchChangePlans`

As chamadas HTTP estão centralizadas em [workspace/artifacts/netops-manager/src/features/bgp-announcements/announcement-api.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/netops-manager/src/features/bgp-announcements/announcement-api.ts:1).

O botão `Atualizar` não faz apenas refetch local. Ele dispara `useRunDiscovery(deviceId)` e, no sucesso, recarrega matriz/evidência/auditoria e ainda tenta sincronizar `community sets` em [workspace/artifacts/netops-manager/src/features/bgp-announcements/AnnouncementPanel.tsx](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/netops-manager/src/features/bgp-announcements/AnnouncementPanel.tsx:82).

### 3. Rotas de API

As rotas da sessão estão em [workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcement.routes.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcement.routes.ts:1):

- `GET /api/bgp/announcements/matrix`
- `GET /api/bgp/announcements/evidence`
- `GET /api/bgp/announcements/expanded-prefixes`
- `POST /api/bgp/announcements/preview-change`
- `GET/POST /api/bgp/announcements/change-plans`
- `GET /api/bgp/upstreams/audit`
- `GET/POST /api/bgp/community-sets/*`

Todas passam por permissão `bgp.announcements.*`.

### 4. Gate de feature flags

O módulo é protegido por flags em [workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcement.gate.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcement.gate.ts:1):

- `BGP_ANNOUNCEMENT_MATRIX_ENABLED` controla a matriz;
- `BGP_ANNOUNCEMENT_PREVIEW_ENABLED` controla preview/plans;
- `BGP_ANNOUNCEMENT_EXECUTION_ENABLED` e `CONFIG_APPLY_ENABLED` continuam bloqueando execução real;
- `BGP_ANNOUNCEMENT_MAX_COLLECTION_AGE_MINUTES` limita preview por idade da coleta.

### 5. Fonte dos dados

O contexto do device é montado em [workspace/artifacts/api-server/src/modules/bgp-announcements/services/announcement-context.service.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/bgp-announcements/services/announcement-context.service.ts:1):

- prioriza `discoverySnapshotsTable`;
- cai para `collectedConfigsTable` se não houver snapshot;
- parseia a configuração;
- constrói `BgpPolicyGraph`;
- calcula `collectionAgeMinutes` e `source`.

Se não existir snapshot nem config, a API retorna `no_snapshot`.

### 6. Construção da matriz

`getAnnouncementMatrix` em [workspace/artifacts/api-server/src/modules/bgp-announcements/announcement-matrix.service.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/bgp-announcements/announcement-matrix.service.ts:86) executa esta sequência:

1. valida que o device existe;
2. carrega contexto (`loadAnnouncementDeviceContext`);
3. sincroniza `community sets` derivados do grafo;
4. descobre/persiste upstreams;
5. chama `buildAnnouncementMatrix`;
6. persiste os targets calculados;
7. aplica filtros `family`, `targetType` e `search`;
8. devolve `meta.source`, `meta.collectionAgeMinutes` e `meta.readOnly`.

O resolvedor principal está em [workspace/artifacts/api-server/src/modules/bgp-announcements/resolvers/announcement-matrix.resolver.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/bgp-announcements/resolvers/announcement-matrix.resolver.ts:1).

Regras centrais do resolvedor:

- percorre `route_policies`;
- exclui policies ligadas como `export` da matriz e registra finding global;
- inclui apenas classificações aceitas por `shouldIncludeInAnnouncementMatrix`;
- transforma classificação em `targetType` (`origin`, `customer`, `unknown`);
- avalia apenas nodes `permit`;
- resolve `prefix-list` ou `network statements` afetados;
- resolve communities diretas ou via `community-list`;
- monta células por circuito usando namespace de communities;
- calcula `riskLevel` por escopo, compartilhamento de prefix-list e `modifiable`.

### 7. Persistência indireta

Mesmo na rota de leitura, há persistência no banco:

- `ensureCommunitySetsFromGraph` faz `insert ... on conflict do update` em `bgpCommunitySetsTable`;
- `ensureUpstreamCircuitsInDb` faz `insert ... on conflict do update` em `bgpUpstreamCircuitsTable`;
- `persistAnnouncementTargets` apaga todos os targets do device e reinsere o conjunto atual em `bgpAnnouncementTargetsTable`.

Essas operações estão em:

- [workspace/artifacts/api-server/src/modules/bgp-announcements/announcement-matrix.service.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/bgp-announcements/announcement-matrix.service.ts:30)
- [workspace/artifacts/api-server/src/modules/bgp-announcements/services/upstream-circuit-discovery.service.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/bgp-announcements/services/upstream-circuit-discovery.service.ts:1)

### 8. Preview e plano

O modal de edição em [workspace/artifacts/netops-manager/src/features/bgp-announcements/AnnouncementEditModal.tsx](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/netops-manager/src/features/bgp-announcements/AnnouncementEditModal.tsx:1) permite:

- selecionar um novo estado (`on`, `p1`... `off`, `bh`, `no_export`, `none`);
- gerar preview;
- copiar `generatedScript`;
- criar `change plan` em draft quando `preview.allowed === true`.

O preview ainda é read-only do ponto de vista de equipamento. A execução segue bloqueada.

## Achados técnicos

### 1. A tela é read-only para o equipamento, mas não para o banco

Isso é o principal ponto semântico do módulo. A UI comunica `Modo read-only`, o que é verdadeiro para a rede, porém `GET /matrix` recalcula e persiste três tabelas auxiliares. Isso precisa ficar explícito em qualquer discussão de segurança, auditoria ou performance.

### 2. Há duplicação de regra de recorte entre backend e frontend

O backend já restringe a matriz por classificação de policy. Mesmo assim, o frontend aplica um filtro adicional em `visibleRows` para:

- remover qualquer `routePolicyName` que bata com `/export/i`;
- manter apenas `targetType === "origin"` ou `targetType === "customer"`.

Isso está em [workspace/artifacts/netops-manager/src/features/bgp-announcements/AnnouncementPanel.tsx](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/netops-manager/src/features/bgp-announcements/AnnouncementPanel.tsx:72).

Risco: drift entre regra visual e regra da API. Se o backend evoluir a classificação, o frontend pode continuar escondendo linhas válidas por regex no nome.

### 3. O botão `Atualizar` executa discovery SSH, não apenas refresh da view

Operacionalmente isso importa. Um operador pode interpretar `Atualizar` como refetch do snapshot salvo, mas o botão dispara coleta real read-only no device. A lógica está correta para manter a matriz fresca, porém a affordance de produto é mais forte que o rótulo.

### 4. A idade da coleta bloqueia preview, mas não bloqueia leitura da matriz

`getAnnouncementMatrix` aceita coleção antiga e apenas expõe `collectionAgeMinutes`. Já `previewAnnouncementChange` retorna `blocked` quando a coleta excede o limite configurado. Isso significa:

- a visualização continua disponível mesmo velha;
- a simulação muda de estado permitido para bloqueado sem o usuário trocar de tela.

É uma decisão coerente, mas precisa ser entendida em troubleshooting.

### 5. A matriz depende de naming conventions e parsers Huawei VRP

O discovery de upstreams e parte relevante da classificação dependem de convenções de nome (`parseCircuitPolicyName`) e do pipeline de parser de configuração Huawei. Se a policy vier fora do padrão, o módulo tende a degradar para `unknown`, findings ou ausência de linhas.

## Dependências e consumidores

### Dependências principais

- `useRunDiscovery` para recarga operacional no frontend;
- `policy-dependency-pipeline` e `BgpPolicyGraph` para extração do modelo;
- `bgpUpstreamCircuitsTable`, `bgpCommunitySetsTable`, `bgpAnnouncementTargetsTable`;
- parsers de circuit policy, apply-community, community namespace e prefix expansion;
- auth `requirePermission("bgp.announcements.*")`.

### Consumidores principais

- `NetopsTree` e `NetopsOperations`;
- rota de redirecionamento `/bgp/announcements`;
- `AnnouncementEvidencePanel`, `AnnouncementMatrixTable`, `AnnouncementEditModal`;
- auditoria de upstream;
- fluxo de criação de `change plans`.

## Recomendação de encaminhamento

Se o objetivo do issue era somente mapear a lógica, a análise está completa.

Se o objetivo era preparar correção/refino, eu abriria duas frentes:

1. `BGP/SNMP engineer`
   - objetivo: consolidar regra de inclusão/exclusão de linhas apenas no backend;
   - aceite: frontend deixa de filtrar por regex em `routePolicyName` e passa a confiar no contrato da API;
   - risco: ajuste visual pode expor linhas atualmente mascaradas.

2. `Frontend NOC`
   - objetivo: revisar UX do botão `Atualizar`;
   - aceite: ação deixa explícito que dispara discovery read-only ou separa `Refetch` de `Executar coleta`;
   - risco: impacto pequeno de copy/UI, sem alterar contrato da API.

## Contexto do Handoff

- Objetivo: mapear a lógica e os riscos da sessão `NetOps Operation > [DEVICE] > BGP > Anúncios (Matriz)`.
- Owner anterior → Novo owner: CTO → a definir conforme próximo objetivo (`BGP/SNMP engineer` ou `Frontend NOC`).
- Critérios de aceite: fluxo documentado ponta a ponta, regras de inclusão descritas, efeitos colaterais de persistência explicitados, próximos owners sugeridos.
- Riscos / restrições conhecidas: sem acesso ao Paperclip control plane nesta sessão; nenhuma alteração de código de produção executada.
- Bloqueio atual: bloqueio operacional de comunicação com o Paperclip API para comentar/atualizar o issue diretamente.
- Próxima ação: publicar este relatório no thread do KGS-54 assim que a conectividade com o control plane for restabelecida e decidir se haverá child issue de backend, frontend ou ambos.

## Evidências Graphify

Graphify não aplicável — motivo: o comando/ferramenta `/graphify` não está disponível nesta sessão, e não há recursos MCP expostos para Graphify (`list_mcp_resources` e `list_mcp_resource_templates` retornaram vazios).

Consultas realizadas:

- query: `rg -n "Anúncios|Anuncios|Matriz|matrix|advert" workspace/artifacts workspace/lib docs/ai .cursor -g '!**/dist/**'`
- path: `NetopsTree -> NetopsOperations -> AnnouncementPanel -> announcement-api -> bgp-announcement.routes -> bgp-announcement.controller -> announcement-matrix.service -> announcement-context.service / announcement-matrix.resolver`
- explain: leitura direta dos pontos de entrada, rotas, services e resolver para reconstituir dependências, consumidores e efeitos colaterais

Resultado resumido:

- Dependências encontradas: `useRunDiscovery`, `policy-dependency-pipeline`, `BgpPolicyGraph`, parsers Huawei VRP, tabelas `bgp_announcement_targets`, `bgp_community_sets`, `bgp_upstream_circuits`, permissões `bgp.announcements.*`
- Consumidores encontrados: `NetopsTree`, `NetopsOperations`, rota `/bgp/announcements`, modal de preview, painel de evidência, auditoria de upstream, `change plans`
- Riscos/impactos identificados: persistência indireta em rota GET, duplicação de regra frontend/backend, ação `Atualizar` com semântica de discovery real read-only, dependência de naming convention/pipeline Huawei
- Arquivos impactados: [workspace/artifacts/netops-manager/src/features/netops-tree/netops-tree.tsx](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/netops-manager/src/features/netops-tree/netops-tree.tsx:194), [workspace/artifacts/netops-manager/src/pages/netops-operations.tsx](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/netops-manager/src/pages/netops-operations.tsx:476), [workspace/artifacts/netops-manager/src/features/bgp-announcements/AnnouncementPanel.tsx](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/netops-manager/src/features/bgp-announcements/AnnouncementPanel.tsx:42), [workspace/artifacts/netops-manager/src/features/bgp-announcements/announcement-api.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/netops-manager/src/features/bgp-announcements/announcement-api.ts:1), [workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcement.routes.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcement.routes.ts:1), [workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcement.controller.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcement.controller.ts:1), [workspace/artifacts/api-server/src/modules/bgp-announcements/announcement-matrix.service.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/bgp-announcements/announcement-matrix.service.ts:1), [workspace/artifacts/api-server/src/modules/bgp-announcements/services/announcement-context.service.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/bgp-announcements/services/announcement-context.service.ts:1), [workspace/artifacts/api-server/src/modules/bgp-announcements/resolvers/announcement-matrix.resolver.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/bgp-announcements/resolvers/announcement-matrix.resolver.ts:1), [workspace/artifacts/api-server/src/modules/bgp-announcements/services/upstream-circuit-discovery.service.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/bgp-announcements/services/upstream-circuit-discovery.service.ts:1)
