# BGP Announcement Matrix — Branch Scope Review

**Para reviewers:** esta branch carrega escopo acumulado além da BGP Announcement Matrix.

---

## Identificação

| Campo | Valor |
|-------|-------|
| Branch | `kgs-145/provisioning-template-registry-fix` |
| Base sugerida PR | `main` |
| Diff stat | **287 files**, +274443 / -292 |
| Commits desde `main` | 10 |

---

## Commits relevantes (desde `main`)

```
2d2e2af fix(bgp-announcements): run selftests via tsx without committed js artifacts
0ef3699 feat(bgp-announcements): add safe matrix workflow and NOC readiness
2304f0e feat(bgp-announcements): finalize safe NOC homologation readiness
0b115ba fix(system-update): use pnpm exec for focused typechecks
4a4fa5c fix(system-update): make runner staging-safe
5d15916 feat(system-update): add safe GitHub-based update and rollback module
e66a24d feat(system-update): add safe GitHub-based update and rollback module
d22928d codex sync
43fe687 fix inventory device save
0610339 fix vsi/vpls routing and user profile access
8807161 fix(provisioning): resolve template registry route conflict
```

---

## Aviso

**Branch NÃO é BGP-only.**

O PR titulado BGP Announcement Matrix inclui alterações em **copilot**, **vsi-vpls**, **system-update**, **tenants/users**, **graphify-out** e wiring compartilhado (env, auth, routes, App/layout).

**Risco:** revisão monolítica difícil; regressão cruzada entre áreas; migrations 0053–0062 misturam VSI, users, system-update e BGP.

**Recomendação:**
1. Se fluxo permitir → **separar PRs** por área antes do merge em `main`
2. Se merge acumulado for necessário → **review por área** usando tabela abaixo
3. Não assumir que todo diff é BGP — validar cada área independentemente

---

## Classificação por área

| Área | Arquivos | Notas reviewer |
|------|----------|----------------|
| **bgp-announcements (api)** | 23 | Escopo principal deste PR |
| **docs/reports bgp** | 25 | Homologação, release notes, PR reports |
| **tools bgp selftests** | 23 | full-suite 24/24, e2e, noc smoke |
| **netops-manager UI bgp** | 2 | `/bgp/announcements` + modal |
| **migrations** | 8+ | 0053 VSI, 0054–0055 users, 0056 system-update, **0057–0062 BGP** |
| **api-server routing/env/auth** | 8 | Flags BGP em env.ts; RBAC; routes |
| **copilot** | 49 | Módulo completo + selftests |
| **vsi-vpls** | 60 | Docs, parser, API, UI, migrations 0053 |
| **system-update** | 11 | GitHub update/rollback module + UI |
| **graphify-out** | 51 | Cache AST + graph.json (~229k linhas) — **candidato a excluir do merge** |
| **tenants/users** | 7 | CRUD tenants + users refactor |
| **provisioning** | 2 | Template registry route fix |
| **other** | 18 | .graphifyignore, docs misc, bgp upstream audit selftests |

**Estimativa escopo BGP puro:** ~73 arquivos (api + ui + migrations bgp + docs/reports + tools)  
**Fora BGP:** ~214 arquivos (~74% do diff)

---

## Arquivos principais — BGP Announcement Matrix

### API module
- `workspace/artifacts/api-server/src/modules/bgp-announcements/*`
- Controller, routes, preview, approval-execution, graph, matrix-resolver, snapshot, refresh

### Migrations BGP
- `0057_bgp_announcement_matrix.sql`
- `0058_bgp_announcement_change_plans.sql`
- `0059_bgp_announcement_approval_gate.sql`
- `0060_bgp_announcement_execution_lock_postcheck.sql`
- `0061_bgp_announcement_rollbacks_history.sql`
- `0062_bgp_announcement_legacy_schema_reset.sql`
- `workspace/lib/db/src/schema/bgp_announcements.ts`

### UI
- `workspace/artifacts/netops-manager/src/pages/bgp-announcements.tsx`
- `workspace/artifacts/netops-manager/src/features/bgp/bgp-announcements-preview-modal.tsx`

### Docs / reports
- `docs/bgp-announcements/*`
- `reports/bgp-announcements/*`

### Testes
- `tools/bgp-announcement-*.mjs`
- `tools/lib/bgp-selftest-tsx.mjs`

---

## Fora do escopo BGP — reviewer deve checar

### Copilot (49 arquivos)
- `workspace/artifacts/api-server/src/modules/copilot/*`
- `tools/copilot-*.mjs`
- Schema `copilot.ts`, skill `bgp-announcements.skill.ts`

### VSI/VPLS (60 arquivos)
- `workspace/artifacts/api-server/src/modules/l2circuits/vsi-vpls/*`
- `docs/features/vsi-vpls/*`, `scripts/vsi-vpls/*`
- Migration `0053_vsi_vpls_library.sql`, schema `vsi_vpls.ts`
- UI `pages/vsi-vpls.tsx`

### System-update (11 arquivos)
- `workspace/artifacts/api-server/src/modules/system-update/*`
- Migration `0056_system_update.sql`
- UI `pages/system-update.tsx`

### Graphify-out (51 arquivos)
- `graphify-out/graph.json` (+229k linhas)
- Cache AST JSON — provavelmente **não deveria ir para main**

### Tenants/Users (7 arquivos)
- Migrations 0054–0055, routes users/tenants, pages tenants/users

### Provisioning (2 arquivos)
- Route conflict fix template registry

### Shared wiring (8 arquivos)
- `.env.example` — flags BGP + outras
- `env.ts`, `auth.ts`, `routes/index.ts`, `App.tsx`, `layout.tsx`

---

## Segurança BGP (confirmar no review)

```
BGP_ANNOUNCEMENT_EXECUTION_ENABLED=false
BGP_ANNOUNCEMENT_ROLLBACK_ENABLED=false
BGP_ANNOUNCEMENT_REAL_EXECUTION_PROVIDER=disabled
```

- Sem `.js` artifacts commitados em `api-server/src/`
- Selftests rodam via **tsx** (`tools/lib/bgp-selftest-tsx.mjs`)

---

## Recomendação final

| Opção | Quando |
|-------|--------|
| **Merge acumulado** | Se equipe aceita review por área + smoke amplo pós-merge |
| **Split PRs** | Preferível — extrair graphify-out, copilot, vsi-vpls, system-update |
| **Deploy BGP seguro** | Possível mesmo com escopo amplo, desde que migrations + flags conferidas |

Deploy BGP em modo seguro **não exige** habilitar exec real/rollback real.

Relatórios BGP: `reports/bgp-announcements/BGP_ANNOUNCEMENT_PR_DESCRIPTION.md`
