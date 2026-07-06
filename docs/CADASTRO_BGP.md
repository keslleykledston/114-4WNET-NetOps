# PRD + MVP + SPEC DEV — Módulo Cadastro BGP, Clientes, Prefixos e Manobra de Anúncios

Projeto: 4WNET_NETOPS
Repositório: https://github.com/keslleykledston/114-4WNET-NetOps

## 1. Resumo executivo

O objetivo deste módulo é transformar o controle de anúncios BGP em uma ferramenta operacional simples:

Cliente → IPv4/IPv6 → Prefixos → Operadora/CDN/IX → On/P1/P2/P3/P4/Off/BH → Preview → Aplicar → Histórico.

A plataforma deve cadastrar clientes, conexões BGP, prefixos autorizados, downstreams/clientes dos clientes, operadoras, CDNs, IXs e o mapa de communities usado para controlar anúncios.

O sistema deve ler a configuração real do roteador, identificar as communities aplicadas, traduzir essas communities para nomes amigáveis de operadoras/CDNs/IXs e mostrar uma tela interativa onde o operador consiga ver e alterar o estado de anúncio por cliente.

A implementação deve reaproveitar o que já existe no projeto, especialmente o motor do PR BGP Announcement Matrix, sem criar uma arquitetura paralela desnecessária.

## 2. Problema

Hoje, para saber por onde um cliente está sendo anunciado, o operador precisa:

* acessar o roteador;
* localizar o peer/cliente;
* localizar route-policy import/origin;
* localizar prefix-list;
* interpretar apply community;
* descobrir qual community representa qual operadora/CDN/IX;
* entender se está On, com prepend, Off ou Blackhole;
* alterar manualmente;
* lembrar de preservar communities que não devem ser mexidas;
* registrar manualmente o histórico.

Isso é lento, sujeito a erro e difícil de auditar.

## 3. Objetivo do produto

Criar uma camada operacional de cadastro + controle de anúncios BGP por cliente.

O operador deve conseguir:

1. Cadastrar cliente e ASN.
2. Cadastrar em qual dispositivo o cliente faz peering.
3. Cadastrar os IPs do peer, interface, VRF, policies e prefix-lists.
4. Cadastrar prefixos IPv4/IPv6 autorizados do cliente.
5. Cadastrar downstreams/clientes dos clientes.
6. Cadastrar operadoras, CDNs e IXs.
7. Cadastrar o mapa de communities de cada saída.
8. Coletar config real do roteador.
9. Comparar cadastro x configuração real.
10. Mostrar estado atual de anúncio por cliente.
11. Alterar graficamente o estado de anúncio.
12. Gerar preview antes de aplicar.
13. Aplicar mudança no dispositivo quando habilitado.
14. Registrar histórico legível: antes, depois, quem, quando, motivo, comandos e rollback.

## 4. Norte de simplicidade

Não transformar isso em ciência de foguete.

O módulo precisa ser simples para o operador:

* escolher cliente;
* escolher IPv4 ou IPv6;
* ver prefixos;
* ver para quem está anunciando;
* alterar estado;
* confirmar;
* ver histórico.

O motor interno pode ter snapshot, resolver, preview, dry-run, approval e rollback, mas a UI principal deve esconder essa complexidade.

## 5. Estado atual do projeto a reaproveitar

O projeto já possui ou está em PR com:

* módulo BGP Announcement Matrix;
* snapshots;
* refresh;
* latest matrix;
* history/timelapse;
* community resolver;
* prefix expansion;
* preview-change;
* change-plans;
* approval gate;
* dry-run;
* postcheck;
* rollback dry-run;
* rollback postcheck;
* UI `/bgp/announcements`;
* flags de segurança;
* execução real bloqueada por default;
* rollback real bloqueado por default.

Este novo módulo não deve duplicar esse motor.

Ele deve adicionar uma camada “cliente-first” e de cadastro/fonte de verdade por cima do motor existente.

## 6. Princípios

1. Cadastro orienta a operação.
2. Config real valida o cadastro.
3. Heurística nunca deve aplicar mudança sozinha.
4. Operador vê nomes amigáveis, não communities cruas.
5. A mudança deve ser cirúrgica.
6. Communities desconhecidas devem ser preservadas.
7. Policies globais devem ser preservadas.
8. Config ambígua bloqueia apply.
9. Histórico deve ser humano e técnico.
10. Execução real só com múltiplas flags e aprovação.

## 7. Personas

### NOC

Precisa ver rapidamente por onde o cliente está sendo anunciado e fazer manobras simples com segurança.

### Engenharia BGP/N3

Precisa validar policies, communities, prefixos, downstreams, IRR/RPKI futuramente e corrigir inconsistências.

### Admin/Manager

Precisa ver histórico, quem alterou, quando, motivo, impacto e rollback.

## 8. Escopo funcional

### 8.1 Cadastro de clientes BGP

Campos mínimos:

* nome do cliente;
* código interno;
* ASN;
* status;
* tipo:

  * cliente trânsito;
  * peer;
  * CDN;
  * IX;
  * downstream;
  * outro;
* observações;
* parent_customer_id para clientes dos clientes;
* origem do cadastro:

  * manual;
  * descoberto;
  * importado;
  * futuro IRR.

### 8.2 Cadastro de conexão BGP do cliente

Cada cliente pode ter uma ou mais conexões.

Campos mínimos:

* cliente;
* dispositivo;
* address-family:

  * IPv4;
  * IPv6;
  * dual-stack;
* neighbor IPv4;
* neighbor IPv6;
* interface;
* VRF;
* descrição;
* route-policy import;
* route-policy export;
* route-policy origin, se aplicável;
* prefix-list IPv4;
* prefix-list IPv6;
* status;
* último snapshot/coleta;
* observação.

Objetivo: quando o sistema for coletar, ele sabe qual dispositivo, peer, policy e prefix-list analisar.

### 8.3 Cadastro de prefixos autorizados

Campos mínimos:

* cliente;
* conexão opcional;
* prefixo;
* família: IPv4/IPv6;
* ASN origem;
* max prefix length;
* tipo:

  * próprio;
  * downstream;
  * manual override;
  * IRR futuro;
  * RPKI futuro;
* status:

  * ativo;
  * suspenso;
  * pendente;
  * removido;
* descrição;
* validade opcional.

O sistema deve comparar:

* prefixos cadastrados;
* prefixos configurados na prefix-list;
* prefixos recebidos do cliente, quando houver coleta BGP;
* prefixos exportados.

### 8.4 Cadastro de downstreams/clientes dos clientes

Deve permitir que um cliente tenha clientes downstream.

Modelo simples:

* usar a própria tabela de clientes com `parent_customer_id`;
* downstream pode ter ASN próprio;
* downstream pode ter prefixos próprios;
* downstream herda ou referencia a conexão BGP do cliente principal.

Exemplo:

Cliente Provedor ABC
Downstream Empresa XYZ
Prefixo 45.170.10.0/24
ASN origem 270111

### 8.5 Cadastro de operadoras/CDNs/IXs

Essas são as saídas para onde os anúncios são controlados.

Campos mínimos:

* nome amigável;
* tipo:

  * operadora;
  * CDN;
  * IX;
  * peer;
  * upstream;
  * trânsito;
* ASN;
* circuit_id;
* dispositivo, se aplicável;
* neighbor IPv4;
* neighbor IPv6;
* route-policy export;
* status;
* ordem de exibição na matriz;
* IPv4 habilitado;
* IPv6 habilitado;
* observação.

### 8.6 Mapa de communities por saída

Cada saída tem ações possíveis.

Ações mínimas:

* On;
* P1;
* P2;
* P3;
* P4;
* Off;
* BH;
* NoExport;
* Default.

Campos:

* saída/upstream;
* ação;
* community;
* label amigável;
* descrição;
* risk_level:

  * low;
  * medium;
  * high;
  * critical;
* enabled;
* address-family opcional.

Exemplo:

TIM
Circuit ID 10
On = 64777:51001
P1 = 64777:51002
P2 = 64777:51003
P3 = 64777:51004
P4 = 64777:51005
Off = 64777:51067
BH = 64777:51066

## 9. Tela principal desejada

Nome da tela:

Gestão de Anúncios BGP

Subtítulo:

Controle por cliente de anúncios para operadoras, CDNs e IX.

Fluxo da tela:

1. Selecionar cliente.
2. Selecionar conexão/dispositivo.
3. Selecionar IPv4 ou IPv6.
4. Ver prefixos autorizados.
5. Ver matriz de anúncios.
6. Alterar estado por saída.
7. Gerar preview.
8. Solicitar aprovação, se aplicável.
9. Aplicar ou dry-run.
10. Ver histórico.

Exemplo visual:

Cliente: Provedor ABC
ASN: 269999
Device: 4WNET-BVA-BRT-RB
AFI: IPv4

| Prefixo         | TIM | VIVO | IX.br | CDN | EBT |
| --------------- | --- | ---- | ----- | --- | --- |
| 45.169.160.0/24 | On  | P2   | On    | Off | P1  |
| 45.169.161.0/24 | On  | On   | Off   | On  | P3  |

Estados:

* On;
* P1;
* P2;
* P3;
* P4;
* Off;
* BH;
* sem marcação;
* desconhecido;
* conflito.

## 10. Histórico legível

O histórico deve ser exibido assim:

Em 05/07/2026 22:41, Keslley alterou o cliente Provedor ABC:

* IPv4 45.169.160.0/24
* TIM: On → P2
* CDN: On → Off

Motivo:
Perda no circuito TIM/CDN.

Dispositivo:
4WNET-BVA-BRT-RB

Status:
Aplicado e confirmado.

Rollback:
Disponível.

Detalhes avançados:

* commands;
* config antes;
* config depois;
* snapshot antes;
* snapshot depois;
* approval;
* dry-run;
* postcheck;
* rollback commands.

## 11. MVP

### MVP 1 — Cadastro + leitura + matriz cliente-first

Objetivo:
Criar a fonte de verdade operacional e uma tela simples por cliente, sem execução real inicialmente.

Entregas:

1. CRUD de clientes BGP.
2. CRUD de conexões BGP do cliente.
3. CRUD de prefixos autorizados.
4. Cadastro de downstreams via parent_customer_id.
5. CRUD de saídas: operadora/CDN/IX.
6. CRUD de mapa de communities por saída.
7. Integração com devices já existentes.
8. Integração com o motor BGP Announcement Matrix já existente.
9. Tela cliente-first.
10. Tradução de community para nome amigável.
11. Estado atual por prefixo x saída.
12. Preview usando motor existente.
13. Histórico legível usando change-plans/snapshots existentes.
14. Comparação cadastro x config real.
15. Bloqueio de apply para config ambígua.

Não entra no MVP 1:

* consulta real IRR;
* consulta real RPKI;
* apply real em roteador;
* rollback real;
* criação automática de peer;
* geração automática de prefix-list em produção;
* múltiplos vendors além do que já existe.

### MVP 2 — Aplicação real controlada

Objetivo:
Permitir aplicar a mudança no roteador, mas somente com guardrails fortes.

Pré-requisito:
MVP 1 estável, UI validada por humano NOC e ambiente lab testado.

Entregas:

1. Apply real via provider controlado.
2. Múltiplas flags obrigatórias.
3. Aprovação obrigatória.
4. Motivo obrigatório.
5. Lock por cliente/policy.
6. Preservação de communities desconhecidas.
7. Remoção cirúrgica somente da community do circuit_id alterado.
8. Postcheck lendo config novamente.
9. Rollback gerado antes de aplicar.
10. Histórico antes/depois.
11. Log de comandos.
12. Bloqueio para Off/BH sem aprovação elevada.

Flags obrigatórias para apply real futuro:

* CONFIG_APPLY_ENABLED=true;
* BGP_ANNOUNCEMENT_EXECUTION_ENABLED=true;
* BGP_ANNOUNCEMENT_REAL_EXECUTION_PROVIDER=ssh ou connector;
* BGP_ANNOUNCEMENT_ROLLBACK_ENABLED=true, somente se rollback real for habilitado.

Default deve continuar OFF.

## 12. Regras de segurança

### 12.1 Mudança cirúrgica

Ao alterar TIM de On para P2, o sistema deve:

* localizar community antiga do circuit_id TIM;
* remover apenas essa community;
* adicionar nova community;
* preservar todas as outras;
* preservar communities desconhecidas;
* preservar protected global filters;
* preservar marcações de outras saídas.

Nunca fazer `undo apply community` cego sem recompor tudo com segurança.

### 12.2 Config ambígua bloqueia apply

Bloquear alteração se encontrar:

* mais de uma ação para o mesmo circuit_id;
* community desconhecida crítica;
* route-policy compartilhada por vários clientes sem confirmação;
* prefix-list vazia;
* cliente sem conexão;
* policy não encontrada;
* community-list compartilhada sem exact match seguro;
* Cxx/upstream export como target;
* customer export como target;
* snapshot stale;
* conflito entre cadastro e config real.

### 12.3 Off e BH

Off e BH devem ter tratamento especial:

* risco alto;
* justificativa obrigatória;
* confirmação extra;
* aprovação elevada;
* destaque visual;
* rollback obrigatório;
* postcheck obrigatório.

### 12.4 Modo read-only

O sistema deve continuar útil mesmo sem apply real:

* coleta;
* matriz;
* auditoria;
* preview;
* dry-run;
* histórico;
* inconsistências;
* comparação cadastro x roteador.

## 13. IRR/RPKI futuro

O módulo deve nascer preparado, mas não implementar consulta real no MVP 1.

Campos preparados:

No cliente:

* as_set;
* irr_source;
* irr_validation_mode;
* rpki_validation_mode;
* prefix_source;
* last_irr_sync_at;
* last_rpki_check_at.

Fluxo futuro:

1. Consultar AS-SET.
2. Expandir prefixos.
3. Comparar com cadastro.
4. Comparar com prefix-list do roteador.
5. Comparar com BGP received-routes.
6. Comparar com RPKI ROA.
7. Sugerir atualização.
8. Gerar preview.
9. Aplicar com aprovação.

Não implementar IRR real agora. Criar apenas campos e design extensível.

## 14. Dados mínimos / tabelas sugeridas

Reaproveitar padrão de migrations já usado no projeto.

### 14.1 `bgp_customers`

Campos:

* id;
* name;
* code;
* asn;
* type;
* status;
* parent_customer_id;
* as_set;
* irr_source;
* irr_validation_mode;
* rpki_validation_mode;
* notes;
* created_at;
* updated_at;
* created_by;
* updated_by.

### 14.2 `bgp_customer_connections`

Campos:

* id;
* customer_id;
* device_id;
* address_family;
* neighbor_ipv4;
* neighbor_ipv6;
* interface_name;
* vrf_name;
* import_route_policy;
* export_route_policy;
* origin_route_policy;
* ipv4_prefix_list;
* ipv6_prefix_list;
* status;
* source;
* last_snapshot_id;
* last_seen_at;
* notes;
* created_at;
* updated_at.

### 14.3 `bgp_authorized_prefixes`

Campos:

* id;
* customer_id;
* connection_id;
* prefix;
* address_family;
* origin_asn;
* max_prefix_length;
* source;
* validation_status;
* description;
* valid_from;
* valid_until;
* created_at;
* updated_at.

### 14.4 `bgp_exit_points`

Campos:

* id;
* name;
* slug;
* type;
* asn;
* circuit_id;
* device_id;
* neighbor_ipv4;
* neighbor_ipv6;
* export_route_policy;
* enabled_ipv4;
* enabled_ipv6;
* display_order;
* status;
* notes;
* created_at;
* updated_at.

### 14.5 `bgp_exit_community_actions`

Campos:

* id;
* exit_point_id;
* action;
* community;
* label;
* risk_level;
* address_family;
* enabled;
* description;
* created_at;
* updated_at.

### 14.6 `bgp_registry_audit_log`

Campos:

* id;
* entity_type;
* entity_id;
* action;
* before_json;
* after_json;
* actor_user_id;
* reason;
* created_at.

Observação:
Histórico de alteração de anúncio deve reaproveitar change-plans/executions/postchecks do motor BGP existente. Esta tabela é para auditoria de cadastro.

## 15. APIs sugeridas

Base:

`/api/bgp/registry`

### Clientes

* `GET /customers`
* `POST /customers`
* `GET /customers/:id`
* `PATCH /customers/:id`
* `DELETE /customers/:id`

### Conexões

* `GET /customers/:id/connections`
* `POST /customers/:id/connections`
* `PATCH /connections/:id`
* `DELETE /connections/:id`

### Prefixos

* `GET /customers/:id/prefixes`
* `POST /customers/:id/prefixes`
* `PATCH /prefixes/:id`
* `DELETE /prefixes/:id`

### Saídas

* `GET /exit-points`
* `POST /exit-points`
* `GET /exit-points/:id`
* `PATCH /exit-points/:id`
* `DELETE /exit-points/:id`

### Community actions

* `GET /exit-points/:id/community-actions`
* `POST /exit-points/:id/community-actions`
* `PATCH /community-actions/:id`
* `DELETE /community-actions/:id`

### Estado operacional por cliente

* `GET /customers/:id/announcement-state?deviceId=&addressFamily=`
* `POST /customers/:id/reconcile`
* `POST /customers/:id/preview-change`
* `POST /customers/:id/request-change`

Esses endpoints devem chamar internamente o motor existente de BGP Announcement Matrix, não duplicar a lógica.

## 16. UI sugerida

Rotas:

* `/bgp/customers`
* `/bgp/customers/:id`
* `/bgp/exits`
* `/bgp/announcement-control`

Ou, se preferir manter simples:

* `/bgp/announcements` vira a tela operacional;
* abas internas:

  * Controle por Cliente;
  * Clientes;
  * Saídas;
  * Communities;
  * Auditoria;
  * Histórico.

### Tela Controle por Cliente

Componentes:

* seletor de cliente;
* seletor dispositivo/conexão;
* seletor IPv4/IPv6;
* lista de prefixos;
* matriz prefixo x saída;
* painel “estado atual”;
* painel “mudança proposta”;
* botão Preview;
* botão Solicitar aprovação;
* botão Dry-run;
* botão Aplicar, oculto/bloqueado por flags;
* histórico recente.

### Tela Clientes

CRUD simples:

* dados do cliente;
* conexões;
* prefixos;
* downstreams;
* notas.

### Tela Saídas

CRUD simples:

* operadora/CDN/IX;
* circuit_id;
* community map;
* status.

## 17. Critérios de aceite do MVP 1

1. Usuário cadastra cliente com ASN.
2. Usuário cadastra conexão do cliente com device, peer, policy e prefix-list.
3. Usuário cadastra prefixos IPv4/IPv6 autorizados.
4. Usuário cadastra uma saída TIM/CDN/IX com circuit_id.
5. Usuário cadastra community actions On/P1/P2/Off.
6. Sistema lê snapshot/config já coletada.
7. Sistema mostra estado atual por cliente.
8. Sistema traduz community para nome amigável.
9. Sistema mostra prefixos autorizados.
10. Sistema aponta divergência cadastro x config.
11. Sistema gera preview de alteração.
12. Sistema preserva communities desconhecidas.
13. Sistema bloqueia apply se config estiver ambígua.
14. Sistema registra histórico legível de preview/change-plan.
15. Testes passam.
16. Web build passa.
17. Sem artifacts `.js`, `dist/public` ou `node_modules`.
18. Execução real continua OFF.

## 18. Critérios de aceite do MVP 2

1. Apply real só aparece com flags habilitadas.
2. Apply real exige aprovação.
3. Apply real exige motivo.
4. Apply real usa lock por target.
5. Apply real preserva todas communities não relacionadas.
6. Apply real remove apenas community antiga do circuit_id alterado.
7. Apply real adiciona community nova.
8. Postcheck lê config depois.
9. Histórico mostra antes/depois.
10. Rollback é gerado antes do apply.
11. Off/BH exige aprovação elevada.
12. Falha de postcheck marca operação como failed/inconclusive.
13. Nunca aplica se snapshot stale.
14. Nunca aplica em Cxx/upstream export.
15. Nunca aplica em customer export.

## 19. Spec Dev para o agente

### Missão

Implantar o módulo de Cadastro BGP, Clientes, Prefixos, Saídas e Controle Cliente-first de Anúncios BGP no projeto 4WNET_NETOPS, reaproveitando o motor BGP Announcement Matrix já existente.

### Regra principal

Não inventar módulo paralelo complexo.
Não duplicar parser, preview, change-plan, dry-run, postcheck ou rollback se já existir.
Criar a camada de cadastro e a UI cliente-first usando o que já existe.

### Branch sugerida

Depois do merge do PR BGP:

`kgs-145/bgp-customer-registry-announcement-control`

Se o PR BGP ainda não estiver mergeado:

* criar branch a partir de `kgs-145/bgp-announcements-safe-noc`;
* não misturar com branch acumulada `kgs-145/provisioning-template-registry-fix`.

### Tarefa 0 — Auditoria antes de codar

Rodar:

```bash
git fetch origin
git status --short
git branch --show-current
git log --oneline -10
```

Verificar PR BGP:

```bash
git diff --stat origin/main...HEAD
git diff --name-only origin/main...HEAD
```

Confirmar se o código do motor BGP já está disponível:

* módulo backend bgp-announcements;
* migrations 0057–0062;
* endpoints `/api/bgp/announcements`;
* UI `/bgp/announcements`;
* tools selftests;
* docs/reports.

Importante:
Há divergência entre status local anterior e metadata GitHub sobre quantidade de arquivos do PR. Antes de implementar, reconciliar:

* número real de files changed;
* se PR está BGP-only;
* se branch base correta está sendo usada;
* se main já recebeu o PR.

Não começar implementação enquanto isso não estiver claro.

### Tarefa 1 — Mapear estrutura atual

Localizar:

* workspace/artifacts/api-server/src/modules/bgp-announcements
* workspace/artifacts/api-server/src/routes
* workspace/artifacts/api-server/src/env.ts
* workspace/artifacts/api-server/src/auth.ts
* workspace/lib/db/src/schema
* workspace/artifacts/netops-manager/src
* migrations existentes
* padrões de CRUD já usados no projeto
* padrões de UI/tables/forms
* padrão de permissões/RBAC
* padrão de audit log

Gerar relatório:

`reports/bgp-registry/BGP_CUSTOMER_REGISTRY_EXISTING_CODE_AUDIT.md`

Conteúdo:

* arquivos existentes reaproveitados;
* endpoints existentes;
* tabelas existentes;
* componentes UI existentes;
* lacunas;
* plano de implementação.

### Tarefa 2 — Criar migrations

Criar migrations novas com numeração seguinte à última existente.

Tabelas:

* bgp_customers;
* bgp_customer_connections;
* bgp_authorized_prefixes;
* bgp_exit_points;
* bgp_exit_community_actions;
* bgp_registry_audit_log.

Não alterar migrations BGP antigas salvo bug real.

Adicionar índices:

* customer asn;
* customer status;
* connection customer_id;
* connection device_id;
* connection neighbor IP;
* prefix customer_id;
* prefix prefix;
* exit_point circuit_id;
* exit_point type;
* community action community.

Adicionar constraints razoáveis:

* action enum controlada;
* address_family enum controlada;
* status enum controlada;
* prefix único por customer/address_family quando fizer sentido;
* community única por exit_point/action/address_family quando fizer sentido.

### Tarefa 3 — Atualizar schema/db exports

Adicionar schema Drizzle/DB seguindo padrão do projeto.

Não quebrar imports existentes.

Rodar typecheck após schema.

### Tarefa 4 — Backend CRUD

Criar módulo backend simples:

`bgp-registry` ou `bgp-customers`

Preferência:
`bgp-registry`, porque cobre clientes, saídas e communities.

Endpoints:

* customers;
* connections;
* prefixes;
* exit-points;
* community-actions;
* registry audit.

Implementar:

* validação básica;
* paginação simples;
* filtros por status, ASN, nome, device;
* audit log em create/update/delete;
* permissões conforme padrão existente.

Não implementar IRR real agora.

### Tarefa 5 — Integração com motor BGP existente

Criar serviço:

`customerAnnouncementStateService`

Função:

Dado:

* customer_id;
* connection_id;
* address_family;
* device_id;

Resolver:

* route-policy import/origin do cliente;
* prefix-list;
* latest snapshot do device;
* rows/cells existentes no motor BGP;
* community actions cadastradas;
* estado amigável por saída.

Retornar:

```json
{
  "customer": {},
  "connection": {},
  "addressFamily": "ipv4",
  "prefixes": [],
  "matrix": [],
  "findings": [],
  "confidence": "safe|warning|blocked"
}
```

Não duplicar parser de route-policy se o motor já possui isso.

### Tarefa 6 — Preview por cliente

Criar endpoint:

`POST /api/bgp/registry/customers/:id/preview-change`

Payload:

```json
{
  "connectionId": 1,
  "addressFamily": "ipv4",
  "prefix": "45.169.160.0/24",
  "exitPointId": 10,
  "desiredAction": "p2",
  "reason": "Manobra por perda no link"
}
```

Internamente:

* resolver exitPoint → community desejada;
* resolver estado atual;
* chamar preview-change do motor existente;
* retornar diff humano e técnico.

Resposta deve mostrar:

* cliente;
* prefixo;
* saída;
* estado antes;
* estado depois;
* communities removidas;
* communities adicionadas;
* comandos propostos;
* rollback;
* bloqueios;
* risco.

### Tarefa 7 — Request change / change-plan

Criar endpoint:

`POST /api/bgp/registry/customers/:id/request-change`

Internamente:

* usa change-plan existente;
* grava motivo;
* vincula customer_id, connection_id, prefix e exit_point_id se possível;
* retorna change_plan_id.

Não criar fluxo paralelo de approval.

### Tarefa 8 — UI Cadastro

Criar telas:

1. Clientes BGP
2. Detalhe do cliente
3. Conexões
4. Prefixos autorizados
5. Downstreams
6. Saídas / Operadoras / CDNs / IXs
7. Community map

UI simples, estilo CRUD.

Nada de wizard complexo no MVP.

### Tarefa 9 — UI Controle por Cliente

Criar aba ou rota:

`/bgp/announcement-control`

Ou integrar como primeira aba em `/bgp/announcements`.

Fluxo:

* selecionar cliente;
* selecionar conexão;
* selecionar IPv4/IPv6;
* carregar estado;
* mostrar matriz;
* clicar célula;
* escolher ação;
* informar motivo;
* preview;
* criar draft/change-plan;
* dry-run;
* aplicar fica bloqueado por flags no MVP 1.

Mostrar confiança:

* Seguro para preview;
* Atenção;
* Bloqueado.

### Tarefa 10 — Histórico humano

Criar componente de histórico por cliente:

* buscar change-plans/executions/postchecks existentes;
* filtrar por customer_id se mapeado;
* exibir texto humano.

Formato:

Data/hora — usuário — cliente — prefixo — saída — antes → depois — status.

Adicionar botão “ver detalhes técnicos”.

### Tarefa 11 — Comparação cadastro x configuração

Implementar findings simples:

* prefixo cadastrado mas não encontrado na config;
* prefixo na config mas não cadastrado;
* policy cadastrada mas não encontrada;
* community encontrada sem mapping;
* exit point cadastrado sem community action;
* customer sem conexão;
* conexão sem device;
* prefix-list vazia;
* snapshot ausente;
* snapshot stale.

Não bloquear leitura.
Bloquear apply quando finding for crítico.

### Tarefa 12 — Seeds opcionais

Criar seed manual simples ou tela para cadastrar:

* TIM;
* VIVO;
* EBT;
* IX.br;
* CDN;
* actions On/P1/P2/P3/P4/Off/BH.

Não hardcodar nomes no código.

### Tarefa 13 — Testes

Criar testes para:

* CRUD customers;
* CRUD exit points;
* community action mapping;
* customer announcement state;
* preview por cliente;
* bloqueio quando mapping ausente;
* bloqueio quando config ambígua;
* preservação de unknown communities;
* histórico humano.

Adicionar selftest:

`tools/bgp-registry-selftest.mjs`

Rodar:

```bash
cd workspace && pnpm run typecheck && cd ..
node tools/bgp-announcement-full-suite.mjs
node tools/bgp-announcement-e2e-flow-selftest.mjs
node tools/bgp-registry-selftest.mjs
cd workspace && PORT=3000 BASE_PATH=/ pnpm --filter @workspace/netops-manager run build && cd ..
```

### Tarefa 14 — Documentação

Criar:

* `docs/bgp-registry/README.md`
* `docs/bgp-registry/PRD.md`
* `docs/bgp-registry/API.md`
* `docs/bgp-registry/OPERATIONS.md`
* `docs/bgp-registry/FUTURE_IRR_RPKI.md`
* `docs/bgp-registry/SAFETY.md`

Criar relatório:

* `reports/bgp-registry/BGP_CUSTOMER_REGISTRY_IMPLEMENTATION_REPORT.md`
* `reports/bgp-registry/BGP_CUSTOMER_REGISTRY_TEST_RESULT.md`

### Tarefa 15 — Critério de entrega

Entrega só pode ser marcada como PASS se:

* migrations criadas;
* schema export OK;
* CRUD OK;
* UI CRUD OK;
* tela cliente-first OK;
* estado de anúncio por cliente funcionando;
* preview por cliente funcionando;
* histórico humano funcionando;
* tests PASS;
* web build PASS;
* sem artifacts;
* execução real OFF;
* rollback real OFF;
* docs criadas.

## 20. Fora de escopo explícito

Não fazer agora:

* consulta IRR real;
* consulta RPKI real;
* apply real em produção;
* rollback real em produção;
* geração automática de prefix-list;
* provisionamento completo de peer BGP;
* integração com Registro.br;
* automação multi-vendor ampla;
* refatoração grande do motor BGP existente;
* alteração da branch acumulada com graphify/copilot/vsi/system-update.

## 21. Riscos

### Risco 1 — duplicar motor BGP

Mitigação:
usar motor existente de preview/change-plan/snapshot.

### Risco 2 — cadastro divergente da config

Mitigação:
findings e confidence score.

### Risco 3 — apply apagar community errada

Mitigação:
MVP 1 sem apply real; MVP 2 com mudança cirúrgica e preservação.

### Risco 4 — UI ficar técnica demais

Mitigação:
tela principal cliente-first; detalhes técnicos em aba avançada.

### Risco 5 — IRR virar escopo grande

Mitigação:
só preparar campos agora; implementar consulta no futuro.

## 22. Roadmap

### Fase 1 — Cadastro e matriz cliente-first

* clientes;
* conexões;
* prefixos;
* saídas;
* community map;
* tela cliente-first;
* preview;
* histórico.

### Fase 2 — Compliance BGP

* cadastro x config;
* config x received-routes;
* prefixos indevidos;
* prefixos ausentes;
* alertas.

### Fase 3 — Apply real controlado em lab

* provider real;
* aprovação;
* apply;
* postcheck;
* rollback.

### Fase 4 — IRR/RPKI

* AS-SET;
* IRR sync;
* ROA/RPKI;
* sugestões de prefix-list.

### Fase 5 — Provisionamento

* criar novo cliente BGP;
* gerar peer;
* gerar prefix-list;
* gerar policies;
* aprovar;
* aplicar.

## 23. Prompt final para execução do agente

MODO CAVEMAN — 4WNET_NETOPS

Missão:
Implantar o módulo BGP Customer Registry + Cliente-first Announcement Control.

Regras:

* Reaproveitar o motor BGP Announcement Matrix existente.
* Não duplicar preview/change-plan/dry-run/postcheck/rollback.
* Não ligar execução real.
* Não ligar rollback real.
* Não implementar IRR real agora.
* Não misturar graphify/copilot/vsi/system-update.
* Não commitar artifacts.
* Não fazer refatoração ampla.

Ordem:

1. Auditar código existente.
2. Criar relatório de reaproveitamento.
3. Criar migrations.
4. Criar schema.
5. Criar backend CRUD.
6. Criar integração com estado de anúncio por cliente.
7. Criar preview por cliente.
8. Criar UI CRUD.
9. Criar UI cliente-first.
10. Criar histórico humano.
11. Criar findings cadastro x config.
12. Criar testes.
13. Criar docs.
14. Rodar validação completa.
15. Entregar relatório final.

Validação obrigatória:

* typecheck PASS;
* BGP full suite PASS;
* BGP e2e PASS;
* bgp-registry selftest PASS;
* web build PASS;
* zero artifacts;
* flags real execution OFF;
* rollback OFF.

Resposta final esperada:

* status PASS/FAIL/BLOCKED;
* arquivos criados;
* migrations;
* endpoints;
* telas;
* testes;
* prints ou curl evidências;
* riscos;
* pendências;
* próximo passo.
