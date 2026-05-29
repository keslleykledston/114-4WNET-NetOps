# Plano Operacional de Provisionamento v0.4

**Projeto:** 114-4WNET_NetOps / NetOps Manager  
**Data:** 2026-05-28  
**Branch analisada:** `feature/v0.3.4-operational-pilot-noc`  
**Commit HEAD:** `1cb7934` — docs(l2): close operational refresh phase  
**Tag mais recente:** `v0.3.4-rc1` / `v0.3.4-operational-pilot-noc`

**Modo desta entrega:** análise + planejamento apenas. Nenhuma alteração de runtime, rede ou dispositivo.

---

## 1. Status atual do MVP

### Git e ambiente

| Item | Valor |
|------|-------|
| Branch | `feature/v0.3.4-operational-pilot-noc` |
| HEAD | `1cb7934` |
| Working tree | Dirty — L2 operational refresh, H3 BGP, docs/reports não commitados |
| Tags v0.* | `v0.1.0-mvp-demo` … `v0.3.4-rc1` (19 tags) |

### Containers (runtime local)

| Container | Status | Porta |
|-----------|--------|-------|
| `netops-db` | Up (healthy) | 5435→5432 |
| `netops-migrate` | Exited (0) | — |
| `netops-api` | Up (healthy) | 8085→8080 |
| `netops-web` | Up (healthy) | 3005→80 |

### Migrations aplicáveis

19 arquivos SQL em `workspace/lib/db/migrations/` (`0001` … `0019`), incluindo:

- RBAC, scheduler, NetBox, compliance enriched, discovery, BGP drilldown, SNMP fast interfaces, operational BGP peers, L2 circuits, L2 operational refresh.

### Guardrails ativos (default)

| Variável | Default | Efeito |
|----------|---------|--------|
| `CONFIG_APPLY_ENABLED` | `false` | Bloqueia execute/rollback real |
| `DRY_RUN_DEFAULT` | `true` | Execute seguro quando apply habilitado |
| `NETOPS_SNMP_REAL_ENABLED` | `false` | SNMP real controlado por flag |
| `SNMP_POLL_ENABLED` | variável | Poller legado desligável |

---

## 2. Módulos existentes

| Módulo | Status | Evidência | Risco | Próximo passo |
|--------|--------|-----------|-------|---------------|
| **Auth/RBAC/users** | ✅ Operacional | `/login`, `/users`, `auth.ts`, `tools/rbac-selftest.mjs`, tag `v0.3.0-user-management` | Viewer vê botões write em algumas telas (403 na API) | Esconder ações por role na UI v0.4.1 |
| **Devices inventory** | ✅ Operacional | CRUD `/devices`, operational summary, pilot device 1 | Credenciais SNMP ainda incompletas em alguns devices | Completar credenciais piloto |
| **Import/export devices** | ✅ Operacional | `devices.ts` export/import, selftests, tags `v0.3.1`/`v0.3.2` | Rollback de import manual | Documentar runbook import |
| **SSH/SNMP connectivity** | ✅ Parcial | SSH test OK piloto; SNMP fast H2/H3; credential resolver | Flags off por default; multi-vendor SNMP limitado | H3.4 scheduler BGP; ampliar vendors |
| **Discovery** | ✅ Operacional | `device-discovery`, snapshots/evidence, selftest | Parsers Huawei incompletos em edge cases | Expandir fixtures VRF/L2VC |
| **BGP peers/routes** | ✅ Operacional | SSH peers/routes, drilldown D4, SNMP fast BGP H3, UI `/operational/bgp` | Prefix counters null em SNMP; execute path legado Cisco-style | Fechar H3 closure docs; drilldown polish |
| **Compliance** | ✅ Operacional | Deep engine v0.2.4+, grouping v0.2.8, stale v0.2.9, export v0.3.3 | False positives sem profile tuning UI | v0.3.5 profile assignment UI |
| **Reports/export** | ✅ Operacional | `/reports`, compliance export, provisioning report Markdown | Retention policy não formalizada | Política de retenção |
| **Scheduler** | ✅ Básico | `/scheduler`, jobs discovery/compliance/health, selftest | Cron expression metadata-only | Parser cron real (futuro) |
| **NetBox readiness** | 🟡 Read-only | `/integrations`, sync local admin-only, selftest readonly | Lab real pendente (`NETBOX_ENABLED`) | Smoke com NetBox lab |
| **Audit** | ✅ Operacional | `/audit`, `logAuditEvent`, selftest | Filtros UI limitados | Expandir filtros export |
| **L2 Circuits** | ✅ Piloto | MVP L2 discovery, operational refresh, UI `/l2-circuits` | WIP não commitado na branch | Commit closure L2 |
| **Provisioning/templates** | 🟡 Preview MVP | v0.4.0 backend + `/provisioning` UI; `/templates` parcial | Templates UI sem view/edit; validação não cruza discovery; apply path legado | **v0.4.0–v0.4.4 (este plano)** |

---

## 3. Estado atual do provisioning/templates

### Arquivos principais

**Backend**

| Arquivo | Função |
|---------|--------|
| `routes/provisioning.ts` | Endpoints jobs, preview, approval, execute, rollback |
| `routes/templates.ts` | CRUD `config_templates` + render |
| `modules/netops/provisioning-templates.ts` | 5 service templates built-in (Huawei VRP) |
| `modules/netops/provisioning-preview.service.ts` | Preview engine, validações, transições de estado |
| `modules/netops/provisioning.service.ts` | Job detail, report Markdown |
| `modules/netops/provisioning-template-seed.ts` | Seed idempotente → `config_templates` |
| `lib/env.ts` | `configApplyEnabled`, `dryRunDefault` |

**Frontend**

| Arquivo | Função |
|---------|--------|
| `pages/provisioning.tsx` | Wizard preview + jobs + approval + export |
| `pages/templates.tsx` | Lista + create + delete (sem view/edit) |
| `lib/provisioning-api.ts` | Client helpers preview/approval |

**Banco**

| Tabela | Uso |
|--------|-----|
| `config_templates` | Templates Jinja2 persistidos |
| `provisioning_jobs` | Jobs com estados workflow |
| `provisioning_steps` | Steps por device (preflight/apply/validate) |
| `reports` | Relatórios Markdown ligados a jobs |

### Endpoints existentes

```text
GET  /api/provisioning/service-templates
POST /api/provisioning/service-templates/seed
POST /api/provisioning/preview

GET  /api/provisioning-jobs
POST /api/provisioning-jobs
GET  /api/provisioning-jobs/stats
GET  /api/provisioning-jobs/:id
POST /api/provisioning-jobs/:id/validate
POST /api/provisioning-jobs/:id/preview
POST /api/provisioning-jobs/:id/request-approval
POST /api/provisioning-jobs/:id/approve
POST /api/provisioning-jobs/:id/cancel
POST /api/provisioning-jobs/:id/report
POST /api/provisioning-jobs/:id/execute
POST /api/provisioning-jobs/:id/rollback

GET    /api/config-templates
POST   /api/config-templates
GET    /api/config-templates/:id
PATCH  /api/config-templates/:id
DELETE /api/config-templates/:id
POST   /api/config-templates/:id/render
```

### Service templates built-in (v0.4.0)

| serviceType | Nome | Vendor |
|-------------|------|--------|
| `l2vpn_vpws` | L2VPN VPWS (L2VC) | Huawei VRP |
| `l2vpn_vpls` | L2VPN VPLS (VSI) | Huawei VRP |
| `l3vpn_vrf` | L3VPN / VRF | Huawei VRP |
| `bgp_peer_customer` | BGP peer — Customer | Huawei VRP |
| `bgp_peer_provider` | BGP peer — Provider | Huawei VRP |

Cada um inclui: `requiredParameters`, `optionalParameters`, `parameterSchema`, `template`, `rollbackTemplate`.

### O que já funciona

- Preview stateless (`POST /provisioning/preview`) com config + rollback textual
- Validação básica: device existe, IP presente, parâmetros obrigatórios, janela de manutenção
- Workflow de estados: `draft → validated → pending_approval → approved → blocked` (execute)
- UI `/provisioning`: seleção device/serviço, formulário dinâmico, preview, rascunho, validar, solicitar/aprovar, export Markdown
- Audit: `provisioning_preview`, `provisioning_execute_blocked`, `provisioning_rollback_blocked`, etc.
- Apply e rollback **bloqueados** quando `CONFIG_APPLY_ENABLED=false` (default)
- Export de plano via preview local ou `POST /provisioning-jobs/:id/report`

### O que está incompleto ou mockado

| Lacuna | Detalhe |
|--------|---------|
| Templates UI (`/templates`) | Sem visualizar/editar; hooks `useGetConfigTemplate`/`useUpdateConfigTemplate` não usados |
| Pré-check discovery/compliance | Preview não consulta `discovery_snapshots`, findings ou BGP existente |
| Conflito VLAN/VRF/BGP | Não detecta duplicidade de VRF, peer IP, interface em uso |
| Templates faltantes | Interface/subinterface, route-policy, community, prefix-list |
| Multi-vendor | Apenas Huawei VRP nos service templates |
| Execute real | Path legado usa comandos Cisco-style (`show running-config \| section mpls`) — **não usar em Huawei** |
| RBAC granular | Approve não exige role admin; sem permissão `provisioning.approve` |
| Estado `rejected` | Transição não exposta na UI |
| Pós-check | Sem validação read-only pós-plano |

### O que está bloqueado por segurança (intencional)

- `CONFIG_APPLY_ENABLED=false` → execute marca job `blocked`, steps `skipped`
- Rollback real bloqueado com mesma flag
- Sem `system-view`, `commit`, `save` no preview engine
- Header `# PREVIEW ONLY` em todos os templates built-in

---

## 4. Guardrails de segurança

Regras **obrigatórias** para todas as fases v0.4.x:

1. Manter `CONFIG_APPLY_ENABLED=false` em produção/piloto até v0.4.4 aprovado explicitamente
2. Manter `DRY_RUN_DEFAULT=true`
3. Nenhum SSH write, config mode ou commit
4. Preview e validate são read-only (DB + render textual)
5. Audit obrigatório em preview, validate, approve, execute blocked, export
6. Evidence/relatórios sem secrets (community, password)
7. Dupla aprovação planejada para v0.4.4 (não implementar antes)
8. Janela de manutenção obrigatória antes de approve em v0.4.2+

---

## 5. Lacunas

### Produto

- Templates operacionais incompletos (7 tipos solicitados vs 5 entregues)
- UI Templates desalinhada da UI Provisioning
- Wizard sem integração com discovery/compliance do device selecionado
- Sem diff visual antes/depois vs config coletada
- Sem bloqueio automático por findings `BLOCKER_REAL`

### Técnico

- Render Jinja2 simplificado (replace string, não engine completa)
- `config_templates` DB e `SERVICE_TEMPLATES` code duplicados (sync via seed)
- Execute path legado incompatível com Huawei — risco se flag ligada acidentalmente
- Selftests dedicados a provisioning ausentes (`tools/provisioning-*-selftest.mjs`)

### Operacional

- Runbook NOC para provisioning preview não existe
- Piloto v0.3.4 ainda com working tree dirty (L2/H3/docs)
- Falta smoke formal provisioning end-to-end documentado pós-H3

---

## 6. Proposta de arquitetura

```text
┌─────────────────────────────────────────────────────────────────┐
│                        NetOps Manager UI                         │
│  /provisioning (wizard)    /templates (catalog admin)            │
└───────────────┬─────────────────────────────┬───────────────────┘
                │                             │
                ▼                             ▼
┌───────────────────────────┐   ┌───────────────────────────────┐
│ Provisioning Preview Engine│   │ Config Templates Repository    │
│ - schema validation        │   │ - config_templates (DB)        │
│ - render config/rollback   │   │ - built-in seed                │
│ - risk assessment          │   │ - GET/PATCH/render API         │
│ - pre-check adapters       │   └───────────────────────────────┘
└───────────────┬───────────┘
                │
    ┌───────────┼───────────┬──────────────┐
    ▼           ▼           ▼              ▼
 Discovery   Compliance   Device      Audit
 snapshots   findings     inventory   logs
 (read-only) (read-only)  (read-only)
                │
                ▼
┌───────────────────────────┐
│ Provisioning Job Workflow  │
│ draft → validated →        │
│ pending_approval → approved│
│ → blocked (execute)        │
└───────────────────────────┘
                │
                ▼ (v0.4.4+ only, flag gated)
         SSH Write Adapter (future)
         Huawei allowlist + rollback
```

**Princípio:** preview engine consome dados read-only existentes; nunca altera device na fase v0.4.0–v0.4.3.

---

## 7. Templates iniciais

### Entregues (v0.4.0)

| Template | Schema | Rollback | Pré-check | Pós-check |
|----------|--------|----------|-----------|-----------|
| BGP peer customer | ✅ | ✅ template | 🟡 básico | ❌ |
| BGP peer provider | ✅ | ✅ template | 🟡 básico | ❌ |
| L3VPN/VRF | ✅ | ✅ template | 🟡 básico | ❌ |
| L2VPN VPWS | ✅ | ✅ template | 🟡 básico | ❌ |
| L2VPN VPLS/VSI | ✅ | ✅ template | 🟡 básico | ❌ |

### A criar (v0.4.0+)

| Template | Parâmetros chave | Vendor inicial |
|----------|------------------|----------------|
| Interface/subinterface | `interfaceName`, `vlanId`, `description`, `ipAddress` | Huawei VRP |
| Route-policy | `policyName`, `nodeId`, `ifMatch`, `applyCommunity` | Huawei VRP |
| Community filter | `listName`, `communities[]` | Huawei VRP |
| Prefix-list | `listName`, `prefix`, `ge`, `le` | Huawei VRP |

Cada template novo deve incluir:

- `parameterSchema` (JSON)
- validação de campos obrigatórios
- `template` + `rollbackTemplate`
- `risks[]` automáticos (ex.: policy inexistente)
- `preChecks[]` (v0.4.3): conflito com discovery
- `postChecks[]` esperados (v0.4.3): comandos read-only pós-apply futuro

---

## 8. Fluxo operacional proposto

```text
1. Operador seleciona device + serviceType
2. Formulário dinâmico (schema do template)
3. Preview engine:
   a. Valida parâmetros
   b. Render config + rollback
   c. Pré-check discovery/compliance (v0.4.3)
   d. Lista riscos e missing data
4. Operador revisa preview + adiciona rollback textual
5. Salva job draft
6. Validate job (checks persistidos)
7. Request approval → pending_approval
8. Admin/aprovador revisa → approved
9. Export plano Markdown (audit)
10. Execute → BLOCKED (CONFIG_APPLY_ENABLED=false)
    → status blocked, audit provisioning_execute_blocked
```

**Fora de escopo até v0.4.4:** steps 11+ (apply real, pós-validação SSH write).

---

## 9. Fases v0.4.0–v0.4.4

### v0.4.0 — Provisioning Preview Engine (consolidar + completar)

**Objetivo:** engine preview completa e templates iniciais operacionais em modo seguro.

| Entrega | Detalhe |
|---------|---------|
| Completar 7 templates | + interface, route-policy, community, prefix-list |
| Unificar catalog | `SERVICE_TEMPLATES` ↔ `config_templates` seed |
| Validação schema | Zod por template, mensagens PT |
| Render rollback | Template + rollback textual merge |
| Selftest | `tools/provisioning-preview-selftest.mjs` |
| Docs | Atualizar `PROVISIONING_PREVIEW_WORKFLOW.md` |

**Critério de aceite:** preview API retorna config/rollback/validations/risks para todos os 7+ templates; zero SSH write.

---

### v0.4.1 — Provisioning UI

**Objetivo:** UX operacional completa sem apply.

| Entrega | Detalhe |
|---------|---------|
| Wizard `/provisioning` | Refinar steps, RBAC por botão |
| `/templates` | View read-only (viewer); edit (operator/admin) |
| Formulário dinâmico | Driven by `parameterSchema` |
| Preview panel | Config + rollback side-by-side |
| Validações inline | Missing params, risks destacados |
| Export | Download Markdown/JSON do plano |

**Critério de aceite:** operador NOC gera preview e export sem 403 inesperado; viewer não vê botões write.

---

### v0.4.2 — Approval Workflow

**Objetivo:** workflow auditável ponta a ponta.

| Entrega | Detalhe |
|---------|---------|
| Estados completos | draft, validated, pending_approval, approved, rejected, cancelled |
| RBAC approve | Admin ou permissão `provisioning.approve` |
| Janela manutenção | Obrigatória para request-approval |
| Rollback plan | Obrigatório texto mínimo |
| Audit trail | Timeline por job na UI |
| Relatório | Markdown com actor, timestamps, plano |

**Critério de aceite:** job percorre workflow completo; execute continua blocked; audit completo.

---

### v0.4.3 — Dry-run Validation

**Objetivo:** pré-check read-only contra dados reais do device.

| Entrega | Detalhe |
|---------|---------|
| Discovery adapter | VRFs, interfaces, BGP peers do snapshot |
| Compliance adapter | Findings BLOCKER_REAL bloqueiam validate |
| Conflitos | VLAN duplicada, VRF existente, peer IP duplicado |
| Policy refs | route-policy/community/prefix-list existem na config coletada |
| Bloqueio | Job não passa validate se conflito crítico |

**Critério de aceite:** selftest com fixtures discovery; validate falha em conflito simulado.

---

### v0.4.4 — Controlled Apply Readiness

**Objetivo:** documentar e preparar apply futuro **sem habilitar default**.

| Entrega | Detalhe |
|---------|---------|
| Requisitos apply | Doc `docs/APPLY_CONTROLLED_READINESS.md` |
| Dupla aprovação | Design + flag `PROVISIONING_DUAL_APPROVAL` |
| SSH adapter Huawei | Substituir path Cisco legado |
| Before/after snapshot | Persistir em `provisioning_steps` |
| Kill switch | `CONFIG_APPLY_ENABLED` + maintenance + audit |
| Runbook | Procedimento rollback manual |

**Critério de aceite:** documentação aprovada; flags permanecem false; nenhum apply em piloto.

---

## 10. Riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Flag apply ligada acidentalmente | Alto — SSH write legado Cisco | Manter false; remover path legado antes de v0.4.4 |
| Preview Huawei incorreto | Médio — plano inválido | Fixtures reais; review NOC; dry-run v0.4.3 |
| Templates UI desalinhada | Baixo — operador confuso | v0.4.1 unifica catalog |
| Working tree dirty | Médio — perda de entregas | Commits escopados L2/H3 antes de v0.4.0 code |
| Duplicação code/DB templates | Baixo — drift | Seed idempotente + test sync |
| Approve sem RBAC | Médio — aprovação indevida | v0.4.2 permissão dedicada |

---

## 11. Critérios de aceite (fase atual — planejamento)

- [x] Status MVP levantado com evidências git/runtime
- [x] Provisioning mapeado (endpoints, services, UI, guards)
- [x] Plano v0.4.0–v0.4.4 documentado
- [x] Guardrails confirmados (`CONFIG_APPLY_ENABLED=false`)
- [ ] Implementação aguardando aprovação explícita

---

## 12. Recomendação

**Próximo passo recomendado (após aprovação):**

1. **Estabilizar branch** — commitar entregas L2/H3/docs pendentes em commits escopados (sem rollback de trabalho de outros agentes)
2. **Iniciar v0.4.0** — completar templates faltantes + selftest preview + fechar gap `/templates` view/edit
3. **Não tocar em apply** — manter `CONFIG_APPLY_ENABLED=false`; tratar execute path legado como débito técnico bloqueado
4. **Integrar v0.4.3 cedo no design** — preview engine deve receber interface `PreCheckAdapter` já na v0.4.0 para evitar refactor

**Ordem de prioridade operacional para NOC:**

```text
v0.4.0 (engine) → v0.4.1 (UI) → v0.4.3 (dry-run vs discovery) → v0.4.2 (approval polish) → v0.4.4 (readiness doc only)
```

A ordem v0.4.3 antes de v0.4.2 reflete valor NOC: validar conflitos reais antes de investir em workflow de aprovação formal.

---

## Referências

- `docs/PROVISIONING_PREVIEW_WORKFLOW.md`
- `docs/APPLY_DRY_RUN_SAFETY.md`
- `reports/V0_4_0_PROVISIONING_PREVIEW_PLAN.md`
- `workspace/artifacts/api-server/src/routes/provisioning.ts`
- `workspace/artifacts/netops-manager/src/pages/provisioning.tsx`
- `workspace/artifacts/netops-manager/src/pages/templates.tsx`
