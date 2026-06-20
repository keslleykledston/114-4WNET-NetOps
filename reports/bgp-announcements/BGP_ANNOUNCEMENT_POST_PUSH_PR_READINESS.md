# BGP Announcement Matrix — Post-Push PR Readiness

**Data:** 2026-06-20  
**Status:** Pronto para abrir PR (modo seguro)

---

## Branch e commits

| Item | Valor |
|------|-------|
| Branch | `kgs-145/provisioning-template-registry-fix` |
| Remote | `origin/kgs-145/provisioning-template-registry-fix` |
| HEAD | `0ef3699` |
| Working tree | limpo exceto fix tsx runner (ver abaixo) |

Commits BGP (topo):

```
0ef3699 feat(bgp-announcements): add safe matrix workflow and NOC readiness
2304f0e feat(bgp-announcements): finalize safe NOC homologation readiness
```

Branch diverge de `origin/main` com **10+ commits** incluindo system-update, vsi-vpls, copilot, tenants, provisioning fix.

---

## Base sugerida do PR

**`main`** (`origin/main` @ `12b72b4`)

Alternativas não necessárias — `origin/HEAD` aponta para `main`.

---

## Diff contra main

```
287 files changed, 274443 insertions(+), 292 deletions(-)
```

**Sem artifacts `.js`/build/dist/node_modules** no diff ✅

Escopo BGP (~80 paths): `docs/bgp-announcements/*`, `reports/bgp-announcements/*`, `tools/bgp-announcement-*`, `workspace/.../bgp-announcements/*`, migrations `0057–0062`, UI `bgp-announcements.tsx`.

**Atenção reviewer:** branch inclui também graphify-out (~229k linhas), vsi-vpls, copilot, system-update, tenants.

---

## Validações pós-push (rodadas agora)

| Comando | Resultado |
|---------|-----------|
| `git status --short` | limpo (+ fix tsx local pendente) |
| `git branch --show-current` | `kgs-145/provisioning-template-registry-fix` ✅ |
| `git diff --name-only ... \| grep .js$` | **NO_JS_ARTIFACTS** ✅ |
| `cd workspace && pnpm run typecheck` | **PASS** |
| `node tools/bgp-announcement-full-suite.mjs` | **24/24 PASS** (~4.6s) |
| `node tools/bgp-announcement-e2e-flow-selftest.mjs` | **PASS** |
| `PORT=3000 BASE_PATH=/ pnpm --filter @workspace/netops-manager run build` | **PASS** |

### Fix aplicado pós-push (local, não commitado)

Selftests falhavam em checkout limpo — imports `.ts` sem artifacts `.js` commitados.

Correção:
- `tools/lib/bgp-selftest-tsx.mjs` — bootstrap tsx
- `tools/bgp-announcement-full-suite.mjs` — roda via tsx
- `tools/bgp-announcement-e2e-flow-selftest.mjs` — auto-reexec tsx

**Recomendação:** commitar fix antes do merge do PR.

---

## Artifacts verificados

| Check | Resultado |
|-------|-----------|
| `.js` em `api-server/src/` no diff | ausente ✅ |
| `dist/public` no diff | ausente ✅ |
| `node_modules` no diff | ausente ✅ |
| migrations 0057–0062 versionadas | ✅ |
| rollback gate fix (`execution_blocked`) | ✅ linha 1210 |

---

## Flags de segurança

```
BGP_ANNOUNCEMENT_EXECUTION_ENABLED=false
BGP_ANNOUNCEMENT_ROLLBACK_ENABLED=false
BGP_ANNOUNCEMENT_REAL_EXECUTION_PROVIDER=disabled
CONFIG_APPLY_ENABLED=false
```

Exec real OFF ✅ | Rollback real OFF ✅

---

## PR description gerada

`reports/bgp-announcements/BGP_ANNOUNCEMENT_PR_DESCRIPTION.md`

Título sugerido:
```
feat(bgp-announcements): safe BGP announcement matrix workflow
```

---

## Comando gh (CLI indisponível)

`gh` **não instalado** neste ambiente.

Criar PR manualmente no GitHub:

1. Base: `main`
2. Compare: `kgs-145/provisioning-template-registry-fix`
3. Título: `feat(bgp-announcements): safe BGP announcement matrix workflow`
4. Body: copiar de `reports/bgp-announcements/BGP_ANNOUNCEMENT_PR_DESCRIPTION.md`

Se `gh` disponível depois:

```bash
gh pr create \
  --base main \
  --head kgs-145/provisioning-template-registry-fix \
  --title "feat(bgp-announcements): safe BGP announcement matrix workflow" \
  --body-file reports/bgp-announcements/BGP_ANNOUNCEMENT_PR_DESCRIPTION.md
```

---

## Ressalvas / riscos

1. Branch **não é BGP-only** — diff grande inclui graphify-out e outras features
2. Device 94 sem origin_target; community-sets/upstream audit vazios
3. UI browser humano pendente
4. Fix tsx runner local ainda não pushado
5. Postcheck inconclusivo sem write real — esperado modo seguro

---

## Próximo ciclo NOC humano

| # | Ação |
|---|------|
| 1 | Browser: `http://localhost:3005/bgp/announcements` |
| 2 | Validar tabs/badges/modal + capturar prints |
| 3 | Device com ORIGIN target |
| 4 | Device com community-sets + upstream audit populado |
| 5 | Registrar `noc-homologation-ui-evidence.json` |
| 6 | Manter exec/rollback OFF |

---

## Recomendação final

**Pronto para deploy controlado em modo seguro** — abrir PR contra `main`, merge após review.

Antes merge:
1. Commit + push fix tsx runner
2. Reviewer validar escopo não-BGP na branch
3. Backup DB + migrations 0057–0062 no target
4. Rebuild api/web pós-merge
5. NOC humano UI walkthrough

**Não habilitar** execução real ou rollback real até pilot lab explícito.
