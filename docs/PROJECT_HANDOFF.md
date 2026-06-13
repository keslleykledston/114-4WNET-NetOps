# Handoff Completo - 114-4WNET-NetOps

Data: 2026-06-10 (atualizado; original: 2026-06-04)
Versão: v0.9.5 (RC — Release Candidate)

## 1. Resumo executivo

`114-4WNET-NetOps` é uma plataforma NetOps enterprise para inventário, compliance, coleta read-only, circuitos L2, operação BGP, conectores WireGuard/bastion, preview de provisioning, gerenciamento de recursos, topologia inteligente e análise de impacto.

**Estado atual:** RC (Release Candidate) — pronto para testes em produção. RC-HARDENING em andamento com alvo de deploy em 2026-06-30.

**Versão atual:** v0.9.5 — 6 fases de desenvolvimento concluídas (v0.9.0 a v0.9.5), 100+ tabelas, 77+ endpoints, 25+ páginas de UI.

O projeto esta estruturado para operar em modo seguro por padrao:

- `CONFIG_APPLY_ENABLED=false`
- `DRY_RUN_DEFAULT=true`
- SNMP/SSH reais ficam atras de feature flags
- NetBox e leitura apenas
- conectores executam acesso a devices de cliente; o server nao deve abrir SSH/SNMP direto em producao cliente

O repositório esta organizado como monorepo pnpm em `workspace/`, com infraestrutura em `infra/`, documentacao funcional em `docs/` e evidencias de fase em `reports/`.

## 1b. Fases v0.9.x — Estado por fase

| Fase | Versão | Status | Descrição |
|------|--------|--------|-----------|
| Compliance Driven Operations | v0.9.0 | ✅ | Drift detection, 13 templates, compliance scoring, auto-trigger |
| Compliance Dashboard & Baselines | v0.9.1 | ✅ | Dashboard multi-tab, recharts, hierarquia de baselines, trend 30d |
| Scheduled Compliance | v0.9.2 | ✅ | Scheduler site/global, CRUD de schedules, histórico |
| Resource Manager | v0.9.3 | ✅ | Pools/allocations/reservations, collision detection, 12+ APIs |
| Topology Intelligence | v0.9.4 | ✅ | Nodes/edges/snapshots, 8 tipos nó, 9 tipos aresta, orphan detection |
| Impact Analysis | v0.9.5 | ✅ | Cascade failure, scenarios workflow, correlação de serviço |
| RC-HARDENING | - | 🔄 | Em andamento — vendor coverage, failover, backup, security review |

## 2. Estado atual do produto

### Entregues e validados

- Inventario de dispositivos com CRUD, detalhe, edicao e exclusao
- Auth local com login/logout, cookie httpOnly e RBAC por roles
- Scheduler local com jobs de discovery, compliance e health check
- Compliance com engine v2, findings sanitizados, export e filtros
- Provisioning preview engine com templates estruturados e apply bloqueado por padrao
- **Config Generator MVP (preview-only)** — engine oficial em `/provisioning`: validate/render, runs, diff, ID allocator K3G, change request preview; closure documentado
- Coleta SSH de configuracao e parsers Huawei VRP para cenarios cobertos
- Coleta SNMP e armazenamento de snapshots
- Operacao NetOps com visoes read-only para BGP/L2/operacional
- Connectors WireGuard + agent para execucao remota na LAN do cliente
- NetBox read-only sync
- Audit logs e relatórios operacionais

### Estado operacional relevante

- Stack Docker sobe com `db`, `migrate`, `api`, `web` e `wg-hub`
- Frontend roda em `http://localhost:3000`
- API responde em `http://localhost:8080/api/healthz`
- A operacao padrao continua protegida contra apply real

### Ultimos ajustes relevantes

- O painel de `Communities` agora segue o layout e a densidade do `60-bgp_manager` com card de cabecalho, tabs compactas, biblioteca em tabela e editor lateral de sets.
- A biblioteca mostra `tags`, estados, origem e uso, com `Sync backup` e `Sync live (SSH)` ativos no backend atual.
- O editor de sets inclui comparacao local entre sets, aviso de membros sem referencia na biblioteca, preview real e acoes de copiar bloco/SHA, sem alterar o contrato do backend.
- A comparacao de sets passou a usar endpoint dedicado no backend atual, preservando o fluxo de preview, apply e auditoria, sem alterar o contrato de importacao/sync.
- Sets importados continuam somente leitura; sets `app_created` seguem editaveis quando a permissão permite.
- As janelas de `Community Sets` e de detalhe foram ajustadas para uma proporcao mais proxima do legacy, com coluna esquerda fixa maior e painel de detalhe com altura dedicada para leitura e edicao.

## 3. Estrutura do repositório

```text
/
├── workspace/          monorepo pnpm com app, API e libs
├── infra/              nginx, wireguard-hub, connector-agent
├── deploy/bastion/     instalacao cliente bastion
├── docs/               docs funcionais e operacionais
├── reports/            evidencias e relatorios de fase
├── tools/              selftests e smokes Node
└── docker-compose.yml  orquestracao local
```

## 4. Arquitetura

### Camadas principais

- Browser SPA em React 19 + Vite 7
- API em Express 5 + TypeScript ESM + esbuild
- Banco em PostgreSQL 16 + Drizzle ORM
- Integracoes de rede via `ssh2` e `net-snmp`
- API contract via OpenAPI -> Orval -> `@workspace/api-client-react`
- Runtime em Docker Compose

### Fluxo de dados

1. Frontend consome API via `/api/*`
2. Nginx faz proxy para `api`
3. API persiste em PostgreSQL
4. Conectores executam jobs na LAN do cliente via WireGuard
5. Coletas e jobs gravam audit, snapshots e findings no banco

### Regra de ouro de seguranca

- A API nao deve fazer SSH/SNMP direto em devices de cliente
- Execucao real de configuracao continua bloqueada por flag
- Logs, audit e exports nao devem carregar secrets

## 5. Módulos centrais

### Backend

- `workspace/artifacts/api-server/src/index.ts` bootstrap HTTP
- `workspace/artifacts/api-server/src/routes/` rotas top-level
- `workspace/artifacts/api-server/src/modules/netops/` dominio operacional
- `workspace/artifacts/api-server/src/modules/l2circuits/` discovery e refresh L2
- `workspace/artifacts/api-server/src/modules/connectors/` WireGuard, jobs e execucao remota
- `workspace/artifacts/api-server/src/modules/compliance/` engine e findings
- `workspace/artifacts/api-server/src/modules/provisioning/` preview engine
- `workspace/artifacts/api-server/src/modules/netbox/` sync read-only
- `workspace/artifacts/api-server/src/modules/scheduler/` agenda local

### Frontend

- `workspace/artifacts/netops-manager/src/App.tsx` roteamento principal
- `workspace/artifacts/netops-manager/src/pages/` paginas principais
- `workspace/artifacts/netops-manager/src/features/` features por dominio

### Libs

- `workspace/lib/db/` schema e migrations
- `workspace/lib/api-spec/` OpenAPI source
- `workspace/lib/api-zod/` schemas gerados
- `workspace/lib/api-client-react/` hooks gerados

## 6. Fluxos principais

### Autenticação e RBAC

- Login local em `/login`
- Sessao em cookie httpOnly `netops_session`
- Roles: `viewer`, `operator`, `admin`
- Middleware protege rotas sensiveis

### L2 circuits

- Discovery via SSH quando `L2_DISCOVER_SSH_ENABLED=true`
- Refresh operacional via `L2_OPERATIONAL_REFRESH_ENABLED=true`
- Refresh e read models sao read-only; nao insere circuito novo

### SNMP_FAST

- Interfaces operacionais: `NETOPS_SNMP_REAL_ENABLED=true`
- BGP operacional: `NETOPS_SNMP_BGP_REAL_ENABLED=true`
- Pilot por allowlist em `SNMP_FAST_PILOT_DEVICE_IDS`

### BGP drilldown

- Snapshot cache para peer drilldown
- Detalhe SSH opcional via `BGP_DRILLDOWN_SSH_DETAIL_ENABLED`

### Connectors

- WireGuard e agent Python para acesso ao cliente
- Jobs async: heartbeat, coleta, ping, traceroute e afins
- Regra: nunca SSH direto no cliente fora do connector

### Compliance

- Engine baseada em snapshot discovery persistido
- Findings com source, confidence, evidence sanitizada e export

### Provisioning preview

- Preview estruturado para L2VPN/L3VPN e compatibilidade com fluxo legado
- Apply e rollback continuam bloqueados por padrao

### NetBox

- Integracao read-only
- `NETBOX_TOKEN` vem apenas de env
- sync local pode criar/atualizar devices locais sem sobrescrever credenciais

## 7. Banco e dados relevantes

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

### `snmp_snapshots`

- `device_id`
- `success`
- `error_message`
- `interfaces_json`
- `bgp_peers_json`
- `vrfs_json`
- `collected_at`

## 8. Runtime e deploy local

### Compose

Servicos:

- `db`
- `migrate`
- `api`
- `web`
- `wg-hub`

### Comandos de uso comum

```bash
cp .env.example .env
docker compose up --build -d
docker compose down
```

### Validacao base

```bash
cd workspace && pnpm run typecheck && pnpm run build
docker compose config
```

### URLs

- Frontend: `http://localhost:3000`
- API health: `http://localhost:8080/api/healthz`

## 9. Flags e segurança

### Flags criticas

- `CONFIG_APPLY_ENABLED=false`
- `DRY_RUN_DEFAULT=true`
- `NETOPS_SNMP_REAL_ENABLED=false`
- `NETOPS_SNMP_BGP_REAL_ENABLED=false`
- `L2_DISCOVER_SSH_ENABLED=false`
- `L2_OPERATIONAL_REFRESH_ENABLED=false`
- `NETBOX_ENABLED=false`

### Regras que nao devem mudar sem aprovacao explicita

- Nao habilitar apply real por padrao
- Nao remover validacao read-only de Huawei VRP
- Nao expor `NETBOX_TOKEN` ou segredos de WireGuard
- Nao alterar banco real ou devices sem autorizacao

## 10. Validação e testes

### Estratificacao

- Typecheck e build em `workspace/`
- Selftests Node em `tools/`
- Smokes HTTP para endpoints em runtime
- Evidencias em `reports/`

### Comandos de referencia

- `node tools/connectors-selftest.mjs`
- `node tools/l2-circuit-huawei-vsi-selftest.mjs`
- `node tools/snmp-fast-operational-selftest.mjs`
- `node tools/provisioning-preview-selftest.mjs`
- `node tools/compliance-runtime-smoke.mjs`
- `node tools/netbox-readonly-selftest.mjs`

## 11. Documentos de referencia

- [Status do projeto](./PROJECT_STATUS.md)
- [Arquitetura IA](./ai/ARCHITECTURE.md)
- [Contexto persistente](./ai/CONTEXT.md)
- [Modulos](./ai/MODULES.md)
- [Fluxos](./ai/FLOWS.md)
- [Testes](./ai/TESTING.md)
- [Config Generator (MVP closure)](./config-generator/CONFIG_GENERATOR_MVP_CLOSURE.md)
- [Planos de MVP](./MVP_CLOSURE_PLAN.md)
- [Provisioning preview](./PROVISIONING_PREVIEW_ENGINE.md)
- [Provisioning preview-only (política)](./provisioning/PROVISIONING_PREVIEW_ONLY.md)
- [NetBox read-only](./NETBOX_READONLY_SYNC.md)
- [Connectors architecture](./connectors/ARCHITECTURE.md)
- [NOC checklist](./NOC_OPERATIONAL_CHECKLIST.md)
- [Incident runbook](./NOC_INCIDENT_RUNBOOK.md)

## 12. Riscos e pendências

### Pendencias operacionais

- Historico SNMP persistido ainda precisa de ampliacao multi-vendor
- Agendamento configuravel por UI continua limitado
- Feedback visual da coleta SNMP no frontend ainda pode ser melhorado
- Botoes BGP ainda precisam de modais/drawers mais completos em alguns pontos
- CD/deploy formal e estrategia de backup/restore ainda precisam ser fechados

### Riscos tecnicos

- Parsers Huawei precisam de cobertura adicional em cenarios reais
- SNMP e SSH reais dependem de flags e lab disponivel
- Conectores exigem gestao cuidadosa de secrets e rotacao

## 13. Próximos passos recomendados

1. Fechar a formalizacao de operacao: secrets management, backup PostgreSQL e pipeline CD
2. Ampliar coleta SNMP multi-vendor e consolidar UI de historico
3. Completar os restantes pontos de UX operacional em BGP e L2
4. Consolidar smokes de runtime para as trilhas mais usadas
5. Manter o padrao safe-first para qualquer mudanca de execucao real

## 14. Onde continuar o trabalho

Se for dar continuidade ao projeto, o ponto de entrada mais util e:

1. `docs/PROJECT_STATUS.md`
2. `docs/ai/CONTEXT.md`
3. `docs/ai/FLOWS.md`
4. `docs/ai/TESTING.md`
5. `workspace/artifacts/api-server/src/routes/index.ts`
6. `workspace/artifacts/netops-manager/src/App.tsx`

## 15. Checklist de retomada rapida

1. Ler `AGENTS.md` e confirmar as travas de seguranca antes de alterar qualquer fluxo operacional.
2. Conferir `git status` para separar mudancas existentes das mudancas desta tarefa.
3. Validar o estado atual com `cd workspace && pnpm run typecheck && pnpm run build`.
4. Se houver alteracao de runtime, subir o stack local ou rebuildar apenas os containers afetados antes de declarar sucesso.
5. Manter `CONFIG_APPLY_ENABLED=false` e demais flags seguras, a menos que o usuario peça explicitamente o contrario.
