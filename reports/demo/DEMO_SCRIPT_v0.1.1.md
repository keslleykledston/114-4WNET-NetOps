# NetOps Service Manager - Demo Interna v0.1.1-mvp-demo

## 1. Objetivo da demo

Demonstrar o MVP liberado para uso interno controlado, com foco em:

- inventário e descoberta persistente
- BGP com consulta real-time via SSH
- audit trail, reports e integrations readiness-only
- segurança: apply e rollback bloqueados por padrão

### Fala sugerida

"Hoje vou mostrar a versão v0.1.1-mvp-demo do NetOps Service Manager. O foco é validar o fluxo operacional principal sem aplicar configuração real em dispositivo."

## 2. Público-alvo

- time de operações
- time de redes
- time de automação/infra
- liderança técnica

### Fala sugerida

"A demo é para quem opera a rede no dia a dia e para quem precisa validar que o MVP já cobre o fluxo essencial com segurança."

## 3. Pré-requisitos

- containers `netops-api`, `netops-web` e `netops-db` healthy
- acesso ao ambiente local/interno
- navegador moderno
- dispositivo(s) já cadastrados para demonstração

### Fala sugerida

"Antes de começar, o ambiente precisa estar saudável e com pelo menos um dispositivo cadastrado para eu conseguir mostrar descoberta e BGP."

## 4. Ambiente

- URL web: `http://127.0.0.1:3005`
- API: `http://127.0.0.1:8085`
- modo seguro padrão:
  - `CONFIG_APPLY_ENABLED=false`
  - `DRY_RUN_DEFAULT=true`

### Fala sugerida

"O ambiente está rodando em modo seguro. Execução real continua bloqueada por padrão."

## 5. Fluxo da apresentação

### 5.1 Abrir dashboard

- abrir a home
- mostrar visões gerais de inventário e status

#### Fala sugerida

"Vou começar pelo dashboard para mostrar a visibilidade operacional geral do ambiente."

### 5.2 Listar devices

- abrir lista de dispositivos
- mostrar cadastro existente
- mostrar que o inventário está funcional

#### Fala sugerida

"Aqui estão os dispositivos cadastrados. O inventário é a base para discovery, compliance e provisioning."

### 5.3 Teste de conectividade

- executar teste SSH em um device
- mostrar resultado de sucesso ou falha controlada

#### Fala sugerida

"Primeiro validamos conectividade. Isso evita disparar discovery em um alvo indisponível."

### 5.4 Discovery persistente

- executar discovery
- mostrar snapshot persistido
- abrir evidência se necessário

#### Fala sugerida

"Agora eu executo o discovery. O resultado não é só efêmero: ele fica persistido para rastreio e auditoria."

### 5.5 BGP peers

- abrir árvore BGP
- mostrar peers por categoria
- abrir detalhe de peer

#### Fala sugerida

"O BGP é separado por categorias operacionais. O peer pode ser inspecionado sem confundir contadores de mensagens com prefixos."

### 5.6 BGP routes real-time

- consultar prefixos recebidos e anunciados
- mostrar que a consulta usa SSH real-time
- mostrar histórico de rotas quando disponível

#### Fala sugerida

"A consulta de rotas é real-time via SSH. O histórico existe para auditoria, mas a resposta atual vem do roteador."

### 5.7 Audit logs

- abrir `/audit`
- mostrar evento registrado
- mostrar filtros básicos

#### Fala sugerida

"Tudo que importa operacionalmente deixa rastro de auditoria sanitizado. O foco aqui é rastreabilidade sem expor segredo."

### 5.8 Reports

- abrir `/reports`
- mostrar relatório Markdown
- copiar ou baixar o conteúdo

#### Fala sugerida

"Os relatórios formalizam o job de provisionamento e deixam um resumo legível do que foi validado ou bloqueado."

### 5.9 Integrations readiness-only

- abrir `/integrations`
- mostrar NetBox como readiness-only
- reforçar que não há sync real

#### Fala sugerida

"A área de integrações está preparada para fases futuras, mas aqui ainda é só readiness. Não existe sincronização real com NetBox."

### 5.10 Provisioning seguro

- abrir provisioning
- criar job se fizer sentido para o demo
- mostrar pre-check, preview e rollback preview
- tentar execute
- mostrar bloqueio por `CONFIG_APPLY_ENABLED=false`

#### Fala sugerida

"Essa é a parte mais importante do MVP: validar o fluxo sem risco. Execute e rollback reais continuam bloqueados por padrão."

## 6. Pontos de atenção

- não prometer apply real
- não prometer rollback real
- não confundir `Update messages` com prefixos
- não expor senha, token ou SNMP community
- se um dado estiver ausente, explicar como `readiness` ou `placeholder` e não como falha do core

### Fala sugerida

"Alguns itens estão intencionalmente protegidos ou em readiness-only. Isso é requisito de segurança, não falta do MVP."

## 7. Funcionalidades demonstradas

- dashboard
- device CRUD
- SSH test
- discovery persistente
- BGP peers
- BGP routes SSH real-time
- compliance básico
- templates
- audit logs
- reports Markdown
- integrations readiness-only
- apply/rollback bloqueados por padrão

### Fala sugerida

"O que eu vou demonstrar aqui cobre o fluxo operacional essencial do MVP, com segurança e rastreabilidade."

## 8. Funcionalidades fora do escopo

- apply real em produção
- rollback real
- NetBox sync real
- RBAC completo
- scheduler completo
- automação destrutiva

### Fala sugerida

"Esses itens estão fora do escopo desta versão. O objetivo agora é validação interna segura, não automação irrestrita."

## 9. Riscos conhecidos

- necessidade de conexão com dispositivo para responder algumas telas
- dados incompletos em dispositivos sem discovery recente
- readiness-only em integrações pode parecer incompleto para quem espera sync real
- qualquer tentativa de execute/rollback real deve continuar bloqueada

### Fala sugerida

"Os riscos conhecidos já estão controlados no desenho atual. O principal é alinhar expectativa: o MVP é seguro por padrão."

## 10. Próximos passos

- ampliar cobertura Huawei em parser e fixtures
- evoluir integrações para fases futuras
- aumentar cobertura formal de testes
- preparar hardening adicional antes de liberar qualquer apply real

### Fala sugerida

"Depois da demo, o próximo passo é ampliar cobertura e maturidade. A base já está pronta para evoluir com segurança."

## 11. Checklist antes da demo

- [ ] `netops-api` healthy
- [ ] `netops-web` healthy
- [ ] `netops-db` healthy
- [ ] `/api/healthz` responde
- [ ] `/api/audit-logs` responde
- [ ] `/api/reports` responde
- [ ] `/api/integrations` responde
- [ ] navegador aberto em `:3005`
- [ ] device de teste cadastrado
- [ ] foco no modo seguro confirmado

### Fala sugerida

"Antes de iniciar, vou confirmar que o ambiente está saudável e que o modo seguro continua ativo."

## 12. Checklist pós-demo

- [ ] registrar feedback do time
- [ ] anotar gaps percebidos
- [ ] registrar dúvidas de negócio
- [ ] revisar qualquer dado faltante observado
- [ ] manter apply/rollback bloqueados
- [ ] arquivar o roteiro usado

### Fala sugerida

"Depois da demo, vou consolidar feedback, riscos e próximos passos. Nada muda no modo seguro do ambiente."
