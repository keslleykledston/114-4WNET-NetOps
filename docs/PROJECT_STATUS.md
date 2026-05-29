# Project Status

## Projeto

- Nome: `114-4WNET-NetOps`
- Objetivo: plataforma NetOps para inventário, validação, coleta e automação de dispositivos de rede
- Estrutura:
  - `workspace/` — monorepo app/API/libs
  - `infra/` — nginx e arquivos de infra
  - raiz — bootstrap Docker, compose e documentação operacional

## Stack

- Frontend: React, Vite, Wouter, shadcn/ui, Tailwind
- Backend: Express 5, TypeScript, esbuild
- Banco: PostgreSQL, Drizzle ORM
- Integrações de rede:
  - SSH via `ssh2`
  - SNMP via `net-snmp`
- Tipagem/contrato:
  - OpenAPI em `workspace/lib/api-spec/openapi.yaml`
  - geração de client React Query e schemas Zod via Orval

## Funcionalidades Implementadas

### Inventário de dispositivos

- cadastro de dispositivo com:
  - hostname
  - IP
  - vendor
  - platform
  - site
  - role
  - porta SSH
  - usuário
  - senha criptografada
  - comunidade SNMP
- listagem de dispositivos
- visualização de detalhes do dispositivo
- exclusão de dispositivo
- edição de dispositivo:
  - botão de edição na listagem
  - botão de edição na tela de detalhe

### Validação de conectividade

- teste de conexão SSH por dispositivo
- autenticação SSH com `keyboard-interactive` primário e `password` como fallback
- atualização de status do dispositivo:
  - `active`
  - `unreachable`
  - `unknown`
- atualização de `last_seen` quando a conexão é bem-sucedida

### Compliance

- cadastro e gestão de políticas de compliance
- execução de jobs de compliance por contexto
- armazenamento de findings
- visão de resumo e histórico

### Provisioning (v0.4.0 preview MVP — apply bloqueado)

- service templates built-in: L2VPN VPWS/VPLS, L3VPN/VRF, BGP customer/provider (Huawei VRP)
- `POST /api/provisioning/preview` — render config + rollback + validações
- workflow: draft → validated → pending_approval → approved → blocked (execute)
- UI `/provisioning` — wizard preview, jobs, approval, export Markdown
- UI `/templates` — lista + create + delete (view/edit pendente v0.4.1)
- guards: `CONFIG_APPLY_ENABLED=false`, `DRY_RUN_DEFAULT=true`
- plano operacional v0.4.x: `reports/V0_4_PROVISIONING_OPERATIONAL_PLAN.md`

### Auth / RBAC local

- autenticação local com login/logout em `/login`
- roles:
  - `viewer`
  - `operator`
  - `admin`
- sessões em cookie httpOnly `netops_session`
- usuário admin inicial via `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME`
- middleware backend protege rotas sensíveis
- auditoria registra actor real quando autenticado

### Scheduler local

- jobs agendados em banco
- tipos:
  - discovery
  - compliance
  - health_check
- alvo:
  - device
  - device_group
  - all_devices
- UI em `/scheduler`
- execução tolerante a falhas por device
- audit trail por run

### Coleta via SSH

- coleta de configuração de dispositivo
- parsing básico de:
  - VLANs
  - interfaces
  - peers BGP
  - L2VPN
  - L3VPN
- persistência da última configuração coletada

### Coleta via SNMP

- campo `Comunidade SNMP` disponível no cadastro e edição
- tabela `snmp_snapshots` criada no banco
- poller SNMP iniciado no backend
- ciclo de coleta configurado para 5 minutos
- persistência de snapshots com:
  - sucesso/erro
  - interfaces
  - peers BGP
  - VRFs
- API explícita para consulta de histórico SNMP em `/api/snmp-snapshots`
- tela dedicada `SNMP History` para consultar snapshots persistidos

### Operacao NetOps

- baseline UX documentado em `reports/frontend/UX_BASELINE.md`
- guardrails de design documentados em `docs/frontend/UX_GUARDRAILS.md`
- mapeamento funcional do `60-bgp_manager` documentado em `reports/migration/60_BGP_MANAGER_FEATURE_MAP.md`
- TODOs de fases futuras em `reports/migration/FUTURE_PHASE_TODOS.md`
- arvore operacional adicionada em `/netops-operations`
- placeholders funcionais para:
  - Device
  - Interfaces
  - BGP
  - BGP Operadoras
  - BGP Clientes
  - BGP CDN/IX
  - Filters
  - Communities
- skill local do projeto em `.codex/skills/netops-migration/SKILL.md`
- tool local `tools/netops-audit.sh`
- FASE 3 concluida:
  - APIs read-only NetOps em `/api/netops/devices/:id/*`
  - `/netops-operations` consumindo APIs
  - endpoint de snapshot SNMP latest
- FASE 4 concluida:
  - safety guard de comandos Huawei VRP read-only
  - adapters SNMP/SSH read-only em modo stub seguro
  - parsers Huawei VRP iniciais
  - normalizador BGP com roles, IPv4/IPv6 e campos operacionais
  - botoes BGP read-only por peer
  - endpoints stub para detalhes, prefixos, policies, communities e diagnostico

### CI

- workflow GitHub Actions em `.github/workflows/ci.yml`
- validação de:
  - instalação PNPM com lockfile congelado
  - `pnpm run typecheck`
  - `pnpm run build`
  - `docker compose config`
  - `docker build`

## Estado Atual Validado

- stack Docker sobe com:
  - `netops-db`
  - `netops-migrate`
  - `netops-api`
  - `netops-web`
- healthchecks OK para API, banco e frontend
- `pnpm run typecheck` OK
- `BASE_PATH=/ PORT=5000 pnpm run build` OK
- `docker compose config` OK
- `docker build --pull --no-cache -t netops-manager-ci .` OK
- conexão SSH validada no dispositivo cadastrado `4WNET-BVA-BRT-RX`
- rebuild local `docker compose up -d --build api web` OK com BuildKit + cache pnpm

## Dados Relevantes do Modelo

### Tabelas principais

- `devices`
- `device_groups`
- `compliance_policies`
- `compliance_jobs`
- `compliance_findings`
- `config_templates`
- `provisioning_jobs`
- `provisioning_steps`
- `collected_configs`
- `snmp_snapshots`
- `audit_logs`
- `reports`
- `integration_settings`

### Dados gravados em `snmp_snapshots`

- `device_id`
- `success`
- `error_message`
- `interfaces_json`
- `bgp_peers_json`
- `vrfs_json`
- `collected_at`

## MVP Critical Gaps Closure

- guards de segurança para apply/rollback implementados com default seguro
- audit trail sanitizada disponível via `/api/audit-logs`
- relatórios Markdown disponíveis via `/api/reports`
- integrações readiness-only disponíveis via `/api/integrations`
- páginas `/audit`, `/reports` e `/integrations` adicionadas ao frontend
- índices faltantes aplicados no banco vivo
- rebuild Docker estabilizado com `.dockerignore` enxuto e install PNPM por manifesto
- RBAC local básico entregue com login, cookies seguros e proteção por role
- scheduler local básico entregue com run-now e histórico
- NetBox read-only sync entregue com status, test connection, preview e sync local
- Compliance profundo v0.2.4 entregue com source/confidence/evidence sanitizada

## Pendências

### SNMP

- dispositivo atual ainda está sem `snmp_community` preenchida no banco
- sem comunidade configurada, poller SNMP inicia mas não coleta desse device
- coleta SNMP atual está implementada com foco inicial em:
  - interfaces padrão IF-MIB
  - peers BGP Huawei
  - VRFs derivadas do contexto BGP Huawei
- falta ampliar suporte multi-vendor/multi-platform para:
  - Cisco
  - Juniper
  - Nokia
- falta definir OIDs e parsing mais completos para:
  - VRF/interface binding
  - BGP peers por VRF em outros vendors
  - contadores adicionais de peering e interface

### Produto

- falta agendamento configurável por UI
- falta feedback visual no frontend para:
  - status da coleta SNMP
  - última coleta SNMP
  - erro da última coleta SNMP
- falta ligar botoes BGP a modais/drawers reais
- falta habilitar coleta SNMP/SSH real controlada read-only na FASE 5
- falta substituir placeholders restantes por paineis reais completos na FASE 6

### Operação

- falta pipeline CD/deploy
- falta secrets management formal para ambientes fora do Docker local
- falta definir estratégia de backup do PostgreSQL
- se SSH ainda falhar com `SSH authentication failed`, validar credencial, AAA no equipamento e se o usuario VRP permite login SSH por `keyboard-interactive`

### v0.2.3 NetBox Read-Only

- NetBox usa somente chamadas `GET` contra NetBox.
- `NETBOX_TOKEN` vem apenas de env e nao e retornado pela API.
- `/integrations` mostra readiness, test/list/preview e sync local admin-only.
- sync local cria/atualiza devices locais sem sobrescrever credenciais.
- validacao real fica pendente ate existir `NETBOX_ENABLED=true`, `NETBOX_URL` e `NETBOX_TOKEN`.

### v0.2.4 Compliance Profundo

- Compliance usa `discovery_snapshot` persistido como fonte principal.
- Findings incluem `source`, `confidence`, objeto, recomendação e evidence sanitizada.
- Checks Huawei VRP cobrem security, NTP, interface, VRF/L3VPN, BGP e L2VPN.
- Sem snapshot gera `unknown`/`warning` controlado.
- Scheduler compliance reutiliza a engine nova.
- UI `/compliance` ganhou filtros por status, severity, contexto, source, confidence e device.

### MVP Closure

- apply real continua bloqueado por padrão
- NetBox permanece read-only contra NetBox; sync atual escreve apenas no banco local
- RBAC avançado, SSO e scheduler configurável seguem fora do escopo desta fase
- RBAC avançado e SSO seguem fora do escopo desta fase
- parser Huawei ainda precisa de cobertura adicional em cenários reais
- hardening final adicionou fixtures formais para BGP verbose, route-policy, communities, interfaces, L2VPN e route query
- relatório de aceite atualizado em `reports/MVP_ACCEPTANCE_VALIDATION.md`

## Issues Técnicas Abertas

- GitHub #1: Expor histórico SNMP persistido via API e tela dedicada
- GitHub #2: Expandir coleta SNMP multi-vendor e normalização de OIDs
- GitHub #3: Adicionar controle operacional para agendamento e status da coleta SNMP
- GitHub #4: Formalizar operação: secrets management e backup PostgreSQL
- GitHub #5: Definir pipeline CD e estratégia de deploy

## Próximos Passos Recomendados

### ✅ v0.3.0 — Gestão de usuários (Completed)

1. ✅ Implementar tela `/users` com CRUD.
2. ✅ Schema de permissões granulares por módulo.
3. ✅ Reset de senha com token temporário.
4. ✅ Session timeout e revoke manual.
5. ✅ Audit log de ações de usuário.
**Status:** ✅ Completed (v0.3.0)

### ✅ v0.3.1 — Import/Export dispositivos (Completed)

1. ✅ Parser de CSV/XLSX com preview pré-aplicação.
2. ✅ Validação de IP/hostname, deduplicação.
3. ✅ Endpoint de export (sem secrets).
4. ✅ Histórico de imports com auditoria.
**Status:** ✅ Completed (v0.3.1-v0.3.2)

### ✅ v0.3.3 — Compliance Report Export (Completed)

1. ✅ Botão download na UI compliance.
2. ✅ Gerador de relatório (Markdown/JSON/CSV).
3. ✅ Evidence sanitizada, summary de categorias.
4. ✅ Export endpoints (findings, groups).
5. ✅ Permissões via compliance.export.
6. ✅ Audit logging de todos exports.
7. ✅ OpenAPI + Orval codegen.
8. ✅ Selftest suite (16/16 tests).
**Status:** ✅ Completed (v0.3.3) — Production Ready

### v0.4.x — Provisioning operacional seguro (Planned)

1. v0.4.0 — Completar preview engine + templates faltantes + selftests
2. v0.4.1 — UI wizard + `/templates` view/edit + export
3. v0.4.2 — Approval workflow + RBAC approve + audit timeline
4. v0.4.3 — Dry-run validation vs discovery/compliance
5. v0.4.4 — Controlled apply readiness (documentação only; flags permanecem false)

Plano: `reports/V0_4_PROVISIONING_OPERATIONAL_PLAN.md`

### v0.3.4 — Pilot operacional NOC (In Development)

1. ✅ Selection of 3 pilot devices (BVA-BRT-RX, BVA-BRT-RA, BVA-CDS-RX)
2. 🔄 Full operational workflow validation:
   - Device connectivity test (SSH + SNMP)
   - Device discovery (interfaces, BGP, VLANs)
   - BGP peer inspection and route query
   - Compliance scan with findings export
   - Report download (markdown/JSON/CSV)
   - Audit log verification
3. ✅ NOC operational checklist (pre-shift, daily, end-of-shift)
4. ✅ Incident runbook (7 categories, 20+ scenarios)
5. ✅ UX feedback checklist for operator satisfaction
6. ✅ Operational pilot smoke test
7. 🔄 Operational readiness validation report
8. 🔄 Future enhancements identified (dashboard, alerts, streaming)

### Fases Futuras (v0.2.9+ contínuo)

1. FASE 4.1: migrar favicon/icone K3G do `60-bgp_manager`.
2. FASE 5: habilitar coleta SNMP/SSH real controlada read-only atras de flag/config.
3. Validar histórico SNMP com snapshots reais do ambiente.
4. FASE 6: ligar botoes BGP a modais/drawers e paineis completos.
5. Definir CD/deploy, secrets e backup/restore testável.
