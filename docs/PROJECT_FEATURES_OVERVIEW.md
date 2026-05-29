# Project Features Overview — Guia para Agentes e Devs

**Projeto:** 114-4WNET NetOps  
**Branch atual:** `feature/v0.3.4-operational-pilot-noc`  
**Última análise:** 2026-05-24  
**Análise completa:** [`reports/project/PROJECT_STATUS_ANALYSIS.md`](../reports/project/PROJECT_STATUS_ANALYSIS.md)

---

## 1. O que é este projeto

Plataforma NetOps para:

- Inventariar dispositivos de rede
- Coletar estado operacional (SSH read-only, SNMP)
- Validar compliance contra políticas
- Provisionar configs com dry-run/approval
- Operar visão NOC (BGP, interfaces, L2 circuits)

**Vendor principal:** Huawei VRP. Outros vendors parcialmente preparados.

---

## 2. Onde está cada coisa

### Raiz repo

| Path | Conteúdo |
|------|----------|
| `workspace/` | **Todo código fonte** (monorepo pnpm) |
| `docs/` | Documentação funcional |
| `reports/` | Relatórios de validação, fases, smoke |
| `tools/` | Selftests CLI (preferir estes para validação segura) |
| `docker-compose.yml` | Stack local: db, migrate, api, web |
| `.env` | Secrets locais — **nunca commitar** |

### Backend

```
workspace/artifacts/api-server/src/
├── app.ts, index.ts
├── routes/          # Routers /api/*
├── modules/         # Domínios
│   ├── l2circuits/
│   ├── netops/      # discovery, provisioning, huawei-vrp parsers
│   ├── compliance/
│   ├── devices/
│   ├── netbox/
│   └── scheduler/
└── lib/             # auth, ssh, snmp, crypto, audit
```

### Frontend

```
workspace/artifacts/netops-manager/src/
├── App.tsx          # Rotas wouter
├── pages/           # 1 rota = 1 page
├── features/        # Módulos por domínio
│   ├── l2-circuits/
│   ├── bgp/
│   ├── device-discovery/
│   ├── device-inventory/
│   ├── compliance/
│   └── netops-tree/
└── components/      # layout, auth, ui/
```

### Database

```
workspace/lib/db/
├── src/schema/      # Drizzle tables
└── migrations/      # SQL numerado 0001–0014+
```

---

## 3. Stack resumida

| Camada | Tech |
|--------|------|
| API | Express 5, TypeScript, esbuild |
| DB | PostgreSQL 16, Drizzle ORM |
| SSH/SNMP | ssh2, net-snmp |
| UI | React 19, Vite, Wouter, TanStack Query, shadcn/ui |
| Auth | Cookie session + RBAC (viewer/operator/admin) |
| Deploy | Docker Compose |

---

## 4. Features disponíveis

### Inventário

- **Onde:** `/devices`, `/devices/:id`
- **API:** `/api/devices`
- CRUD, test SSH/SNMP, import XLSX, export sem secrets
- **Files:** `routes/devices.ts`, `modules/devices/`, `features/devices/`

### Discovery operacional (NetOps)

- **Onde:** device detail → Discovery panel; `/netops-operations`
- **API:** `POST /api/devices/:id/discover`, `/api/netops/devices/:id/*`
- SSH + SNMP → snapshot persistido
- **Files:** `modules/netops/device-discovery/`, `features/device-discovery/`

### BGP / Interfaces / Filters

- **Onde:** `/netops-operations`, device detail BGP tabs
- Peers, routes query, filters, communities (parcial)
- **Files:** `features/bgp/`, `modules/netops/service.ts`

### Compliance

- **Onde:** `/compliance`, `/policies`
- Jobs, findings, export CSV/JSON/Markdown
- **Files:** `modules/compliance/`, `features/compliance/`

### Provisioning

- **Onde:** `/provisioning`, `/templates`
- Dry-run default; apply gated
- **Files:** `modules/netops/provisioning*`, `pages/provisioning.tsx`

### Config collection + SNMP

- **Onde:** `/config-collection`, `/snmp-history`
- Poller 5min background
- **Files:** `lib/snmp-poller.ts`, `routes/snmp_snapshots.ts`

### Scheduler

- **Onde:** `/scheduler`
- Jobs: discovery, compliance, health_check
- **Files:** `modules/scheduler/`

### Auth / Users

- **Onde:** `/login`, `/users` (admin)
- **Docs:** `docs/RBAC_MODEL.md`, `docs/AUTH_LOCAL_SETUP.md`

### Integrations / NetBox

- **Onde:** `/integrations`
- Read-only GET contra NetBox; sync local admin-only
- **Docs:** `docs/NETBOX_READONLY_SYNC.md`
- **Flag:** `NETBOX_ENABLED=false` default

### L2 Circuits — Discovery (backend)

- **API:** `/api/l2-circuits/*`
- **Flag:** `L2_DISCOVER_SSH_ENABLED=false` default
- **Docs:** `docs/l2-circuits/L2_CURRENT_STATE.md`
- **Module:** `modules/l2circuits/`

### L2 Circuits — NOC UI (frontend read-only)

- **Onde:** `/l2-circuits` (sidebar "L2 Circuits")
- **Não** dispara discovery
- **Files:** `pages/l2-circuits.tsx`, `features/l2-circuits/*`

### Audit / Reports

- **Onde:** `/audit`, `/reports`

---

## 5. Mapa de rotas frontend

| Rota | Page |
|------|------|
| `/login` | Login |
| `/` | Dashboard |
| `/devices` | Devices list |
| `/devices/:id` | Device detail |
| `/l2-circuits` | L2 NOC read-only |
| `/compliance` | Compliance |
| `/provisioning` | Provisioning |
| `/templates` | Config templates |
| `/policies` | Compliance policies |
| `/config-collection` | SSH config collect |
| `/snmp-history` | SNMP snapshots |
| `/netops-operations` | Operational tree |
| `/audit` | Audit logs |
| `/reports` | Provisioning reports |
| `/integrations` | Integrations |
| `/scheduler` | Scheduled jobs |
| `/users` | User admin |

Auth guard: sem login → redirect `/login`.

---

## 6. Mapa de API (principais prefixos)

| Prefixo | Domínio |
|---------|---------|
| `/api/healthz` | Health (public) |
| `/api/auth/*` | Login/logout/sessions |
| `/api/users/*` | User admin |
| `/api/devices/*` | Inventory + discovery trigger |
| `/api/netops/devices/:id/*` | Operational read API |
| `/api/compliance/*` | Compliance |
| `/api/provisioning/*` | Provisioning |
| `/api/l2-circuits/*` | L2 discovery + list |
| `/api/netbox/*` | NetBox integration |
| `/api/scheduler/*` | Scheduled jobs |
| `/api/audit-logs` | Audit |
| `/api/snmp-snapshots` | SNMP history |

Todas (exceto health + login) exigem sessão autenticada.

---

## 7. Flags de ambiente importantes

| Flag | Default | Efeito |
|------|---------|--------|
| `L2_DISCOVER_SSH_ENABLED` | `false` | Gate discovery L2 SSH |
| `CONFIG_APPLY_ENABLED` | `false` | Bloqueia apply real |
| `DRY_RUN_DEFAULT` | `true` | Provisioning seguro |
| `NETBOX_ENABLED` | `false` | NetBox integration |
| `NETOPS_SNMP_REAL_ENABLED` | `false` | SNMP real vs stub |
| `SCHEDULER_ENABLED` | on | Background scheduler |
| `SNMP_POLL_ENABLED` | on | SNMP poller |

**Nunca alterar flags sem aprovação explícita do operador.**

---

## 8. Como rodar local (safe)

```bash
cp .env.example .env
# Preencher ADMIN_EMAIL, ADMIN_PASSWORD (sem commitar)
docker compose up -d --build
```

URLs lab típicas:

- Web: `http://127.0.0.1:3005`
- API: `http://127.0.0.1:8085/api/healthz`

### Validações seguras (sem SSH/dispositivos)

```bash
cd workspace && pnpm typecheck
node tools/l2-dot1q-parser-selftest.mjs
node tools/l2-s6730-parser-selftest.mjs
node tools/l2-classification-selftest.mjs
node tools/l2-collector-selftest.mjs
node tools/rbac-selftest.mjs
node tools/compliance-deep-selftest.mjs
```

### Validação UI L2 (read-only)

1. Login web
2. Abrir `/l2-circuits`
3. Confirmar dados carregam via GET
4. Confirmar **sem** POST `/discover`

Ver: `reports/l2-circuits/PHASE_2_3_WEB_DEPLOY_SMOKE_REPORT.md`

---

## 9. O que NÃO fazer sem aprovação

| Ação | Por quê |
|------|---------|
| `L2_DISCOVER_SSH_ENABLED=true` | SSH live em devices |
| `POST /api/l2-circuits/discover` | Discovery L2 |
| `POST /api/devices/:id/discover` | Discovery operacional SSH |
| Bulk discovery multi-device | Não validado |
| `docker compose` migrate/push em prod | Altera schema |
| Commit `.env` | Secrets |
| Apply provisioning real | `CONFIG_APPLY_ENABLED` |
| NetBox write | Só GET permitido |
| Alterar credenciais devices em prod | Risco operacional |
| Force push main | Destrutivo |

---

## 10. Padrão para novos agentes

### Antes de codar

1. Ler `reports/project/PROJECT_STATUS_ANALYSIS.md`
2. Ler skill migration se aplicável: `.codex/skills/netops-migration/SKILL.md`
3. Confirmar branch e escopo da fase
4. Verificar flags `.env` — não alterar silenciosamente

### Durante implementação

- Backend domain → `modules/<name>/`
- Frontend feature → `features/<name>/` + page em `pages/`
- Schema → `workspace/lib/db/src/schema/` + migration
- Selftest → `tools/<name>-selftest.mjs`
- Relatório fase → `reports/<domain>/PHASE_*_REPORT.md`

### Ao fechar fase

- typecheck OK
- selftest relevante OK
- relatório markdown
- smoke read-only se UI
- **não** commitar unless pedido

---

## 11. Documentação L2 essencial

| Doc | Uso |
|-----|-----|
| `docs/l2-circuits/L2_CURRENT_STATE.md` | Estado atual feature |
| `docs/l2-circuits/MVP.md` | Escopo MVP |
| `docs/l2-circuits/RUNBOOK_L2_DISCOVERY.md` | Discovery controlado |
| `docs/l2-circuits/SAFE_EXECUTION_CHECKLIST.md` | Checklist NOC |
| `docs/l2-circuits/SUPPORTED_SCENARIOS.md` | Matriz cenários |

---

## 12. Próximas fases sugeridas (L2)

1. **2.4** — Paginação + filtros server-side
2. **2.5** — Discovery button protegido (se aprovado)
3. **2.6** — Histórico/delta status
4. **2.7+** — SNMP, NetBox, bulk

Ver roadmap detalhado em `reports/project/PROJECT_STATUS_ANALYSIS.md` §9.
