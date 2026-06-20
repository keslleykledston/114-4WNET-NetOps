# BGP Announcement Matrix — Clean Branch Report

**Data:** 2026-06-20  
**Status:** Branch BGP-only criada e validada

---

## Branches

| Campo | Valor |
|-------|-------|
| Branch origem (acumulada) | `kgs-145/provisioning-template-registry-fix` |
| Branch limpa (PR recomendada) | `kgs-145/bgp-announcements-safe-noc` |
| Base | `origin/main` (`12b72b4`) |
| HEAD limpa | `2621988` (+ commit docs pendente) |

---

## Commits cherry-picked (ordem)

| Original | Novo | Mensagem |
|----------|------|----------|
| `2304f0e` | `263b5dd` | feat(bgp-announcements): finalize safe NOC homologation readiness |
| `0ef3699` | `93b88a3` | feat(bgp-announcements): add safe matrix workflow and NOC readiness |
| `2d2e2af` | `a28690c` | fix(bgp-announcements): run selftests via tsx without committed js artifacts |
| `6bd00ae` | `2621988` | docs(bgp-announcements): document PR scope and review notes |

---

## Conflitos (commit `0ef3699`)

Cherry-pick do commit principal gerou conflitos. Resolução BGP-only:

| Arquivo | Conflito | Resolução |
|---------|----------|-----------|
| `env.ts` | BGP flags vs HEAD | Mantidas **somente flags BGP**; removido `systemUpdate*` |
| `auth.ts` | RBAC permissions | Mantido `bgp_announcements`; removido `systemUpdate` |
| `routes/index.ts` | Router imports | Mantido `bgpAnnouncementsRouter`; removido `systemUpdateRouter` |
| `layout.tsx` | Nav icons/items | Mantido `ClipboardList` + link `/bgp/announcements` |
| `copilot/*.ts` (4 arquivos) | modify/delete | **Removidos** — não existem em `main`, não são dependência BGP |
| `schema/copilot.ts` | added | **Removido** — não usado pelo módulo BGP |
| `schema/bgp_peer_collection_history.ts` | added | **Removido** — não referenciado em api-server |

Sem abort — cherry-pick continuou com sucesso.

---

## Diff stat (limpa vs main)

```
91 files changed, 21594 insertions(+), 2 deletions(-)
```

Comparado branch acumulada: **287 files**, +274443 linhas.

**Redução:** ~68% menos arquivos; sem graphify-out massivo.

---

## Arquivos por área

| Área | Arquivos |
|------|----------|
| bgp-announcements API module | 23 |
| migrations 0057–0062 | 6 |
| schema bgp_announcements | 1 |
| docs bgp-announcements | 8 |
| reports bgp-announcements | 22 |
| tools bgp selftests + tsx runner | 27 |
| netops-manager UI bgp | 2 |
| wiring (env, auth, routes, App, layout) | 7 |
| .env.example | 1 |

**Fora de escopo detectado:** nenhum (`graphify`, `vsi`, `system-update`, `copilot`, `tenants` ausentes).

---

## Artifacts check

```bash
git diff --name-only origin/main...HEAD | grep -E '\.js$|dist/public|node_modules'
# OK: no JS artifacts
```

---

## Validações

| Comando | Resultado |
|---------|-----------|
| `pnpm run typecheck` | **PASS** |
| `node tools/bgp-announcement-full-suite.mjs` | **24/24 PASS** |
| `node tools/bgp-announcement-e2e-flow-selftest.mjs` | **PASS** |
| `pnpm --filter @workspace/netops-manager run build` | **PASS** |

---

## Segurança

```
BGP_ANNOUNCEMENT_EXECUTION_ENABLED=false
BGP_ANNOUNCEMENT_ROLLBACK_ENABLED=false
BGP_ANNOUNCEMENT_REAL_EXECUTION_PROVIDER=disabled
```

Exec real OFF | Rollback real OFF

---

## PR manual recomendado

| Campo | Valor |
|-------|-------|
| Título | `feat(bgp-announcements): safe BGP announcement matrix workflow` |
| Base | `main` |
| Head | `kgs-145/bgp-announcements-safe-noc` |
| Body | `reports/bgp-announcements/BGP_ANNOUNCEMENT_PR_DESCRIPTION.md` |

Compare URL:
`https://github.com/keslleykledston/114-4WNET-NetOps/compare/main...kgs-145/bgp-announcements-safe-noc`

---

## Recomendação final

**Usar `kgs-145/bgp-announcements-safe-noc` para PR** em vez da branch acumulada.

Branch origem `kgs-145/provisioning-template-registry-fix` permanece intacta para entregas paralelas (copilot, vsi-vpls, system-update).

Deploy BGP seguro: migrations 0057–0062 → flags OFF → rebuild api/web → smoke NOC.
