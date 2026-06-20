# Multi-Feature Parallel Commit Scope

**Data:** 2026-06-20  
**Branch:** `kgs-145/provisioning-template-registry-fix`  
**Base:** `origin/main`  
**Working tree:** limpo — alterações já commitadas

---

## Resumo

A branch acumulada contém **291 arquivos** vs `main` (+274k linhas). Não há arquivos pendentes no working tree.

**BGP Announcement Matrix** já isolada em PR dedicado:
- Branch limpa: `kgs-145/bgp-announcements-safe-noc` (91 files)
- PR recomendado contra `main` — **não usar branch acumulada para PR BGP**

Esta branch acumulada serve para **features paralelas** com commits já existentes (majoritariamente por domínio).

---

## Commits existentes por área

| Commit | Área | Arquivos | Mensagem |
|--------|------|----------|----------|
| `8807161` | Provisioning | 2 | fix(provisioning): resolve template registry route conflict |
| `0610339` | VSI/VPLS | ~80 | fix vsi/vpls routing and user profile access |
| `43fe687` | Inventory UI | 2 | fix inventory device save |
| `d22928d` | Copilot + Graphify | ~104 | codex sync (49 copilot + 52 graphify-out) |
| `e66a24d` | System-update | ~17 | feat(system-update): safe GitHub update module |
| `5d15916` | System-update | 3 | feat(system-update): routes + schema wiring |
| `4a4fa5c` | System-update | 6 | fix(system-update): staging-safe runner |
| `0b115ba` | System-update | 2 | fix(system-update): pnpm exec typechecks |
| `2304f0e`–`6bd00ae` | BGP | ~91 | BGP Announcement Matrix (usar branch limpa para PR) |

**Nota:** commit `0ef3699` (BGP) incluiu 4 arquivos copilot (timelapse/prefix-trace/queries/route-policy) — já removidos na branch limpa BGP.

---

## Arquivos por área (vs main)

| Área | ~Arquivos | Status commit |
|------|-----------|---------------|
| VSI/VPLS | 61 | ✅ `0610339` |
| Graphify-out | 52 | ⚠️ `d22928d` — **não recomendado merge main** |
| Copilot | 49 | ✅ `d22928d` (+ overlap BGP commit) |
| BGP Announcements | 29 + docs/tools | ✅ commits BGP — PR via branch limpa |
| System-update | 12 | ✅ 4 commits |
| Tenants/Users | 8 | ✅ dentro `0610339` / `e66a24d` |
| Shared UI (env/auth/routes) | 7 | ⚠️ misturado em system-update + BGP |
| Provisioning | 2 | ✅ `8807161` |
| Outros | 10 | inventory, docs misc |

---

## Artifacts proibidos

```bash
git status --short | grep -E '\.js$|dist/public|node_modules'
# OK: nenhum artifact no working tree
```

```bash
git diff --name-only origin/main...HEAD | grep -E '\.js$|dist/public'
# OK: nenhum .js commitado
```

---

## Recomendação de commits / PRs

Working tree limpo — **novos commits por área não necessários** (já existem). Estratégia recomendada:

| PR sugerido | Branch sugerida | Cherry-pick / commits |
|-------------|-----------------|----------------------|
| BGP (aberto) | `kgs-145/bgp-announcements-safe-noc` | 2304f0e→9a73305 |
| VSI/VPLS | `kgs-145/vsi-vpls` (criar) | `0610339` |
| System-update | `kgs-145/system-update` (criar) | `e66a24d`, `5d15916`, `4a4fa5c`, `0b115ba` |
| Copilot | `kgs-145/copilot` (criar) | `d22928d` (filtrar graphify) |
| Provisioning fix | incluir em PR menor ou com VSI | `8807161` |
| Graphify-out | **excluir** do merge | — |

---

## Testes rodados (branch acumulada, 2026-06-20)

| Comando | Resultado |
|---------|-----------|
| `pnpm run typecheck` | **PASS** |
| `node tools/bgp-announcement-full-suite.mjs` | **24/24 PASS** |
| `node tools/bgp-announcement-e2e-flow-selftest.mjs` | **PASS** |
| `pnpm --filter @workspace/netops-manager run build` | **PASS** |

Testes específicos paralelos disponíveis:
- `node tools/system-update-selftest.mjs`
- `node tools/vsi-vpls-parser-selftest.mjs`
- `node tools/copilot-e2e-smoke.mjs`

---

## Riscos

1. **Escopo amplo** — 291 files se PR único
2. **graphify-out** — ~229k linhas cache; não versionar em main
3. **Migrations mistas** — 0053 VSI, 0054–0055 users, 0056 system-update, 0057–0062 BGP
4. **Shared wiring** — env.ts/auth.ts tocados por system-update e BGP
5. **BGP não reabrir** — flags exec/rollback permanecem OFF

---

## Recomendação final

1. **PR BGP:** usar `kgs-145/bgp-announcements-safe-noc` apenas
2. **Features paralelas:** criar branches limpas por cherry-pick (mesmo padrão BGP)
3. **Não mergear** graphify-out em main
4. **Branch acumulada:** manter como integração lab; push apenas docs novos
5. **Exec/rollback BGP:** OFF — não alterar

---

## Commits desta fase (docs)

| Commit | Conteúdo |
|--------|----------|
| (pendente) | `docs(platform): document parallel feature commit scope` |
