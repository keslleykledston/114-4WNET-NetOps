# BGP Announcement Matrix — PR Tracking

**Última atualização:** 2026-06-20 (agente)  
**Status:** ⏳ Aguardando abertura manual — GitHub requer login autenticado

---

## PR configurado

| Campo | Valor |
|-------|-------|
| Título | `feat(bgp-announcements): safe BGP announcement matrix workflow` |
| Base | `main` |
| Head | `kgs-145/bgp-announcements-safe-noc` |
| HEAD commit | `e790a86` |
| Body | `reports/bgp-announcements/BGP_ANNOUNCEMENT_PR_DESCRIPTION.md` |
| Comentário inicial | `reports/bgp-announcements/BGP_ANNOUNCEMENT_PR_INITIAL_COMMENT.md` |

---

## URL do PR

**Status:** não aberto ainda (sem token gh / browser sem login GitHub)

_Preencher após abertura manual:_
```
https://github.com/keslleykledston/114-4WNET-NetOps/pull/___
```

**Abrir PR (1 clique após login):**  
https://github.com/keslleykledston/114-4WNET-NetOps/compare/main...kgs-145/bgp-announcements-safe-noc?expand=1

**Compare verificado (browser, 2026-06-20):**
- Base: `main` ✅
- Head: `kgs-145/bgp-announcements-safe-noc` ✅
- Commits: **6**
- Files changed: **93** (GitHub UI)
- HEAD visível: `e790a86` ✅
- Sem graphify/vsi/copilot/system-update no escopo da branch ✅

---

## CI

| Check | Status |
|-------|--------|
| CI GitHub | **não iniciado** — PR ainda não aberto |
| typecheck local | **PASS** |
| full suite 24/24 | **PASS** |
| e2e local | **PASS** |
| web build local | **PASS** |

_Atualizar após abertura PR: Actions tab → workflow runs_

---

## Reviewers

| Reviewer | Área | Status |
|----------|------|--------|
| _a definir_ | migrations 0057–0062 | pendente |
| _a definir_ | segurança flags/gates | pendente |
| _a definir_ | UI/UX NOC | pendente |

---

## Comentário inicial (colar no PR após abrir)

Ver arquivo completo: `BGP_ANNOUNCEMENT_PR_INITIAL_COMMENT.md`

---

## Respostas preparadas para reviewer

### Resumo técnico
Matriz operacional BGP modo seguro. Targets: ORIGIN + customer_import. Export e Cxx upstream fora (audit-only). Fluxo: snapshot → preview → change-plan → approval → dry-run → postcheck → rollback dry-run. Exec/rollback real OFF por default.

### Segurança
- `BGP_ANNOUNCEMENT_EXECUTION_ENABLED=false`
- `BGP_ANNOUNCEMENT_ROLLBACK_ENABLED=false`
- UI sem botão exec real; dry-run = `would_execute` only; execute endpoint retorna blocked

### Por que Cxx não está na matriz
Cxx = upstream interpret community. Matriz = onde community é **marcada** (ORIGIN/import). Upstream audit-only.

### Postcheck inconclusivo sem write
Esperado modo seguro. Sem write real, snapshot observado não muda. Postcheck confirma mudanças reais em lab futuro.

---

## Checklist pré-merge

- [ ] PR aberto contra `main`
- [ ] CI PASS
- [ ] typecheck PASS
- [ ] full suite 24/24 PASS
- [ ] e2e PASS
- [ ] web build PASS
- [ ] Sem artifacts .js
- [ ] Flags execution/rollback OFF confirmadas
- [ ] Reviewer ciente: exec real não habilitada
- [ ] Migrations 0057–0062 revisadas
- [ ] Migration 0062 aceita (reset schema legado)
- [ ] Docs/reports OK
- [ ] Files changed BGP-only (sem graphify/vsi/copilot/system-update)

---

## Plano deploy pós-merge

### Antes
- [ ] Backup DB
- [ ] `.env`: EXEC=false, ROLLBACK=false, provider=disabled
- [ ] Apply migrations 0057–0062
- [ ] `tools/apply-containers.sh api web`
- [ ] typecheck + full suite (se ambiente permitir)

### Depois
- [ ] Abrir `/bgp/announcements`
- [ ] Badge "execução real bloqueada"
- [ ] Refresh device teste → preview → draft → approval
- [ ] Dry-run → postcheck → rollback dry-run → rollback postcheck
- [ ] Histórico/timelapse + logs
- [ ] Confirmar execute/rollback real bloqueados

Detalhe: `reports/bgp-announcements/BGP_ANNOUNCEMENT_POST_HOMOLOGATION_DEPLOY_READINESS.md`

---

## Pendências

1. **Login GitHub** e abrir PR manualmente (compare URL acima)
2. Colar body de `BGP_ANNOUNCEMENT_PR_DESCRIPTION.md`
3. Colar comentário de `BGP_ANNOUNCEMENT_PR_INITIAL_COMMENT.md`
4. Atualizar URL do PR neste arquivo
5. Observar CI Actions após abertura
6. Review humano UI browser (ressalva NOC)

---

## Decisões

| Data | Decisão |
|------|---------|
| 2026-06-20 | PR BGP usa branch limpa, não acumulada |
| 2026-06-20 | Exec/rollback real permanecem OFF até pilot lab |
| 2026-06-20 | graphify-out excluído de PRs para main |
| 2026-06-20 | Compare GitHub verificado; abertura bloqueada por auth |

---

## Log de abertura

| Data/hora | Evento |
|-----------|--------|
| 2026-06-20 | Compare page acessada — 6 commits, 93 files, head e790a86 |
| 2026-06-20 | PR não criado — browser sem sessão GitHub autenticada |
| 2026-06-20 | Validações locais reconfirmadas PASS |
