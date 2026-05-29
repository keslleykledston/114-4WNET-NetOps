# Project Status Analysis — 114-4WNET NetOps

**Date:** 2026-05-24  
**Branch:** `feature/v0.3.4-operational-pilot-noc`  
**Commit ref:** `897408c` (local; branch tracks origin)  
**Analysis type:** Read-only — no code/DB/SSH changes  
**Verdict:** **GO — operational pilot + L2 NOC read-only ready**

---

## 1. Resumo executivo

**114-4WNET NetOps** é plataforma NetOps para inventário, discovery operacional, compliance, provisioning controlado, BGP/L2VPN e automação de dispositivos Huawei VRP (foco principal).

Estado atual (2026-05-24):

| Área | Status |
|------|--------|
| Stack Docker local (db + api + web) | ✅ Validado |
| Auth/RBAC local | ✅ Produção-ready |
| Inventário devices + import/export | ✅ |
| Discovery operacional (SSH/SNMP) | ✅ Parcial — Huawei VRP |
| NetOps Operations UI (BGP, interfaces, filters) | ✅ Read-only |
| Compliance engine v2 | ✅ |
| Provisioning (dry-run default) | ✅ Guarded |
| Scheduler | ✅ |
| NetBox read-only sync | ✅ Código pronto; lab pendente |
| **L2 Circuit Discovery MVP** | ✅ **Encerrado GO** |
| **Frontend NOC `/l2-circuits`** | ✅ **FASE 2.3 GO** |
| Bulk L2 discovery | ❌ Não validado |
| SNMP enrichment L2 | ❌ Não implementado |
| NetBox correlation L2 | ❌ Não implementado |

**Dados L2 em campo (lab):** 261 circuitos (device 1: 131 `vlan_local`; device 2: 130 — 82 L2VC/VPWS + 48 VSI). DOWN na UI: 71.

**Flag crítica:** `L2_DISCOVER_SSH_ENABLED=false` (default). Discovery L2 live exige flag + runbook + janela NOC.

---

## 2. Stack técnica

| Camada | Tecnologia |
|--------|------------|
| Linguagem | TypeScript (Node.js 20+) |
| Monorepo | pnpm workspace (`workspace/`) |
| Backend HTTP | Express 5, esbuild bundle |
| ORM / DB | Drizzle ORM + PostgreSQL 16 |
| SSH | `ssh2` |
| SNMP | `net-snmp` + poller background |
| Frontend | React 19, Vite, Wouter, TanStack Query |
| UI | shadcn/ui, Radix, Tailwind v4, lucide-react |
| Contratos API | OpenAPI → Orval → `@workspace/api-client-react` + Zod |
| Container | Docker multi-stage, Compose (`netops-db`, `netops-migrate`, `netops-api`, `netops-web`) |
| Auth | Cookie `netops_session` + Bearer; scrypt passwords; roles viewer/operator/admin |
| Logs | Pino |

### Portas lab (`.env` típico)

| Serviço | Host | Container |
|---------|------|-----------|
| Frontend | `:3005` | `:80` (nginx) |
| API | `:8085` | `:8080` |
| PostgreSQL | `:5435` | `:5432` |

### Validação build (2026-05-24)

- `pnpm typecheck` (workspace) — **OK**
- Deploy web FASE 2.3 — bundle `index-COOgT6vv.js` — **OK**

---

## 3. Arquitetura do repositório

```
114-4WNET_NetOps/
├── workspace/                    # Monorepo fonte
│   ├── artifacts/
│   │   ├── api-server/           # Backend Express (@workspace/api-server)
│   │   ├── netops-manager/       # Frontend SPA (@workspace/netops-manager)
│   │   └── mockup-sandbox/       # Mockups UI
│   └── lib/
│       ├── db/                   # Drizzle schema + migrations
│       ├── api-spec/             # OpenAPI source
│       ├── api-zod/              # Generated Zod
│       └── api-client-react/     # Generated React Query hooks
├── docs/                         # Documentação funcional
├── reports/                      # Relatórios de validação/fases
├── tools/                        # Selftests CLI (read-only safe)
├── infra/                        # nginx, infra files
├── docker-compose.yml
├── Dockerfile
└── .env / .env.example
```

### Padrão backend

- `src/routes/` — routers montados em `/api`
- `src/modules/<domain>/` — lógica de domínio
- `src/lib/` — auth, ssh, snmp, crypto, audit, env
- Auth global após `/auth/login` e `/healthz`

### Padrão frontend

- `src/pages/` — rotas (1 page = 1 rota)
- `src/features/<domain>/` — API hooks, componentes, utils
- `src/components/ui/` — shadcn primitives
- `src/components/layout.tsx` — sidebar + shell

---

## 4. Módulos e features — status

| Feature | Backend | Frontend | Status |
|---------|---------|----------|--------|
| **Auth / RBAC** | `lib/auth.ts`, `routes/auth.ts` | `/login`, `/users` | ✅ |
| **Devices CRUD** | `routes/devices.ts` | `/devices`, `/devices/:id` | ✅ |
| **Import/Export devices** | XLSX preview/apply | import modal | ✅ v0.3.1 |
| **Device discovery** | `modules/netops/device-discovery/` | discovery panel, collect SSH | ✅ Huawei VRP |
| **NetOps read API** | `/api/netops/devices/:id/*` | `/netops-operations` | ✅ |
| **BGP peers/routes** | discovery + netops | bgp-panel, modals | ✅ |
| **Interfaces** | netops adapter | interfaces-panel | ✅ |
| **Route filters / communities** | discovery + community modules | filters, community tabs | ✅ Parcial |
| **Compliance** | `modules/compliance/` | `/compliance` | ✅ v0.2.4+ |
| **Compliance export** | report-export | download buttons | ✅ v0.3.3 |
| **Provisioning** | `modules/netops/provisioning*` | `/provisioning` | ✅ dry-run default |
| **Config templates** | `routes/templates.ts` | `/templates` | ✅ |
| **Policies** | compliance policies | `/policies` | ✅ |
| **Config collection SSH** | collected_configs | `/config-collection` | ✅ |
| **SNMP poller + history** | snmp-poller, snapshots | `/snmp-history` | ✅ Parcial |
| **Scheduler** | `modules/scheduler/` | `/scheduler` | ✅ |
| **Audit** | `routes/audit.ts` | `/audit` | ✅ |
| **Reports** | provisioning reports | `/reports` | ✅ |
| **Integrations / NetBox** | `modules/netbox/` | `/integrations` | ✅ Read-only; lab real pendente |
| **L2 circuits discovery** | `modules/l2circuits/` | — (API only) | ✅ MVP GO |
| **L2 circuits NOC UI** | GET list/detail | `/l2-circuits` | ✅ FASE 2.3 GO |
| **Dashboard** | stats endpoints | `/` | ✅ Básico |

---

## 5. L2 Circuits — status detalhado

Ver também: [`docs/l2-circuits/L2_CURRENT_STATE.md`](../../docs/l2-circuits/L2_CURRENT_STATE.md)

### Backend (`workspace/artifacts/api-server/src/modules/l2circuits/`)

| Componente | Arquivos |
|------------|----------|
| Routes/controller | `l2circuits.routes.ts`, `l2circuits.controller.ts` |
| Service + jobs async | `l2circuits.service.ts` |
| SSH collector | `collectors/ssh.collector.ts` |
| Parsers | `parsers/huawei-vrp-l2.ts`, `dot1q-local.parser.ts`, `s6730-l2.parser.ts`, `classification.helpers.ts` |
| Normalizers | `normalizers/status.normalizer.ts`, `findings.resolver.ts` |
| Safety | `redact-l2-output.ts`, `validateReadonlyCommand()` |
| Types | `l2circuits.types.ts` |

### Endpoints REST

| Method | Path | Uso |
|--------|------|-----|
| POST | `/api/l2-circuits/discover` | Job async — **gate** `L2_DISCOVER_SSH_ENABLED=true` |
| GET | `/api/l2-circuits/discovery-jobs/:runId` | Poll job |
| GET | `/api/l2-circuits` | Lista (query: `device_id`, `circuit_type`, `vc_id`, `vsi_name`) |
| GET | `/api/l2-circuits/:id` | Detalhe |

**Limitação API list:** sem `limit`/`offset` efetivos no handler; `total` = length do array retornado; filtros combinados não suportados server-side; `status`/VLAN/peer só no frontend.

### Tabelas DB

- `l2_circuits` — circuitos persistidos + findings JSON + raw_evidence redigida (max ~240 chars)
- `l2_discovery_jobs` — jobs async por `run_id`

Migration: `0014_l2_circuit_classification.sql` (+ schema Drizzle)

### Tipos suportados (validados / parser)

| Tipo | Device | Status |
|------|--------|--------|
| `vlan_local` | 1 (NE/RX dot1q) | ✅ Live GO |
| `l2vc` / `vpws` | 2 (S6730) | ✅ Live GO |
| `vsi` / `vpls` | 2 (S6730) | ✅ Live GO (vpls parcial) |
| NE8000 verbose L2VC/VSI | fixtures | 🔶 Offline only |

### Findings implementados

`CIRCUIT_DOWN`, `REMOTE_NOT_FORWARDING`, `INCOMPLETE_L2_CONFIG`, `DUPLICATED_VC_ID`, `VLAN_CONFLICT`, `DESCRIPTION_MISSING`, `ROUTER_L2_VLAN_ANOMALY`, `VLAN_ORPHAN`, `VLAN_MULTI_INTERFACE_LOCAL`, `VLAN_USED_IN_L2VC`, `VLAN_USED_IN_VSI`, `VLAN_USED_IN_L3_VRF`, `VLANIF_ORPHAN`, `VLAN_NOT_IN_SWITCH_BATCH`, `CLASSIFICATION_CONFLICT`

### Status operacionais

`UP`, `DOWN`, `PARTIAL`, `CONFIG_ONLY`, `UNKNOWN`

### Frontend NOC (`/l2-circuits`)

- Read-only: list, filtros (device via API; resto client-side), sort NOC, CSV export, detail sheet
- **Não** dispara discovery
- Filtros persistidos em `localStorage`
- UX FASE 2.2; deploy/smoke FASE 2.3 GO

### Trabalho recente (branch, possivelmente uncommitted)

Relatórios `PHASE_2_CLASSIFICATION_*` indicam dry-run de reclassificação VPWS/dot1q (261 rows DB read-only). Arquivos tocados incluem parsers/classification — agentes devem revisar diff antes de nova fase.

---

## 6. Validações realizadas

### L2 MVP (backend)

| Fase | Escopo | Resultado |
|------|--------|-----------|
| 1.1 | Huawei smoke plan | GO |
| 1.3–1.3B | dot1q parser + collector | GO |
| 1.4 | Device 1 resmoke — 131 vlan_local | GO |
| 1.5 | S6730 L2VC parser | GO |
| 1.6 | Device 2 S6730 — 130 circuitos | GO |
| 1.7 | MVP closure | GO |
| 2.x classification | Dry-run/fix reports | GO (read-only analysis) |

### L2 Frontend NOC

| Fase | Escopo | Resultado |
|------|--------|-----------|
| 2.1 | Read-only page + API hooks | GO |
| 2.2 | UX NOC (sort, CSV, filters persist, mobile) | GO |
| 2.3 | Web deploy + Playwright smoke | GO |

### Selftests L2 (safe, local)

```bash
node tools/l2-collector-selftest.mjs
node tools/l2-dot1q-parser-selftest.mjs
node tools/l2-s6730-parser-selftest.mjs
node tools/l2-classification-selftest.mjs
node tools/l2-api-smoke.mjs          # precisa API up + auth
```

### Projeto geral

- `pnpm typecheck` — OK (2026-05-24)
- CI: typecheck + build + docker config (`.github/workflows/ci.yml`)
- v0.3.x: RBAC, import/export, compliance export — validados em reports dedicados

---

## 7. Limitações conhecidas

| Limitação | Impacto |
|-----------|---------|
| Bulk L2 discovery | Não validado; risco operacional alto |
| SNMP L2 enrichment | Não implementado |
| NetBox L2 correlation | Não implementado |
| MAC VLAN/VSI dinâmico | Comandos existem no tipo SSHCollectorOutput; não integrados no MVP |
| API list sem paginação real | Escala mal (>500 circuitos); frontend carrega tudo |
| Filtros API limitados | Só um filtro DB por vez; status/VLAN no client |
| `total` API = array length | Sem count total real paginado |
| Device 2 hostname vs CLI | Cosmético (`BRT-RA` vs `BRT-A_S6730-H48X6C`) |
| Frontend L2 read-only | Discovery só via runbook + flag backend |
| Multi-vendor | Foco Huawei VRP |
| SNMP community vazia em devices | Poller roda mas não coleta |
| Apply provisioning | Bloqueado por default (`CONFIG_APPLY_ENABLED=false`) |
| NetBox live | Precisa env real para validação |

---

## 8. Riscos operacionais

| Risco | Mitigação atual |
|-------|-----------------|
| `display current-configuration interface` pesado | Allowlist + flag; runbook NOC |
| Flag `L2_DISCOVER_SSH_ENABLED` esquecida ligada | Default false; rollback documentado |
| Bulk discovery sem controle | Não exposto na UI L2; runbook exige 1 device |
| Credenciais em logs | Redaction L2 evidence; audit sanitizado |
| SSH timeout / auth fail | Job async com error_message; device status |
| Hostname cadastrado ≠ CLI | Impacta correlação manual; documentado |
| Crescimento DB sem paginação | FASE 2.4 recomendada |
| WIP uncommitted na branch | Revisar antes de deploy produção |

---

## 9. Próximos passos recomendados

### Curto prazo

1. **FASE 2.4** — Filtros server-side + paginação API + frontend
2. Consolidar/classification VPWS se dry-run aprovado para apply
3. Commit/push WIP pendente na branch pilot
4. Atualizar `docs/PROJECT_STATUS.md` pointer para este relatório

### Médio prazo

5. **FASE 2.5** — Botão discovery L2 protegido (checklist UI + flag visual) — só se aprovado
6. **FASE 2.6** — Histórico/delta status L2 entre runs
7. Paginação + índices query compostos
8. NetBox read-only lab validation (`NETBOX_ENABLED=true`)

### Futuro

9. **FASE 2.7** — SNMP enrichment L2
10. **FASE 2.8** — NetBox read-only correlation
11. **FASE 3** — Bulk discovery controlado (rate limit, allowlist devices, paginação jobs)
12. CD/deploy pipeline, secrets management, PostgreSQL backup

---

## 10. Blockers antes da FASE 2.4

| Blocker | Status |
|---------|--------|
| Código L2 MVP + frontend NOC | ✅ Não bloqueia |
| Typecheck | ✅ OK |
| Documentação projeto | ✅ Este relatório |
| Paginação ausente | ⚠️ Motivo da 2.4, não blocker para iniciar |
| WIP uncommitted (classification/collector) | ⚠️ Revisar escopo 2.4 vs WIP |
| SSH/discovery | ❌ Não necessário para 2.4 |

**Conclusão:** **Nenhum blocker técnico impede FASE 2.4.** Recomenda-se alinhar WIP classification com escopo de paginação/filtros.

---

## 11. Decisão GO/NO-GO geral

| Critério | Veredito |
|----------|----------|
| Plataforma operacional local | **GO** |
| Pilot NOC v0.3.4 | **GO** (em fechamento) |
| L2 MVP discovery controlado | **GO** |
| L2 frontend read-only | **GO** |
| Produção externa / bulk / SNMP / NetBox L2 | **NO-GO** (fora escopo atual) |

**Veredito geral: GO para consulta NOC L2 e continuidade FASE 2.4.**

---

## Referências

- L2 closure: `reports/l2-circuits/MVP_L2_DISCOVERY_CLOSURE_REPORT.md`
- L2 frontend: `reports/l2-circuits/PHASE_2_1/2_2/2_3_*`
- Runbook: `docs/l2-circuits/RUNBOOK_L2_DISCOVERY.md`
- Status legado: `docs/PROJECT_STATUS.md`
- Features map: `docs/PROJECT_FEATURES_OVERVIEW.md`
