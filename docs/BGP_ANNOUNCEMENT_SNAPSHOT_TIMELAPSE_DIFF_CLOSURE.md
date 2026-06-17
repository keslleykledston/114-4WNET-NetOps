# BGP Announcement Matrix — Snapshot Timelapse Diff Closure

**Data:** 2026-06-10  
**Branch:** `codex/bgp-peer-dedupe`  
**Commit de implementação:** `4cabd2c` — `feat(bgp-announcements): add snapshot timelapse diff`  
**Status:** ✅ Fase `BGP-ANNOUNCEMENTS.SNAPSHOT-TIMELAPSE-DIFF` fechada — validada em runtime (device 94, snapshots 192 → 193)

Documento oficial de encerramento da fase de **comparação read-only (timelapse/diff)** entre snapshots append-only da BGP Announcement Matrix. Nenhuma execução em device, Change Preview automático, Change Plan automático, apply ou Controlled Execution faz parte desta fase.

---

## 1. Resumo executivo

A BGP Announcement Matrix passa a oferecer **linha do tempo e diff semântico** entre snapshots materializados:

- Snapshots **append-only** em `bgp_announcement_matrix_snapshots`.
- Serviço `computeAnnouncementSnapshotDiff()` compara dois snapshots do **mesmo device** sem alterar dados persistidos.
- Três endpoints read-only (`/diff`, `/:id/diff-latest`, `/timeline`) protegidos por RBAC `bgp.announcements.read`.
- UI na aba **Histórico**: seleção base/compare, resumo, filtros e badges — com banner explícito de read-only.
- Card opcional **Última mudança entre snapshots** na tela principal.

Runtime smoke concluído em **device 94** (`4WNET-BVA-BRT-RB`), comparação **192 → 193**: 1 mudança `metadata_changed`, `readOnly: true`. Timeline com **3 snapshots**. API/Web healthy. Typecheck OK. Selftests **15/15**.

---

## 2. Escopo entregue

| Item | Entrega | Status |
|------|---------|--------|
| Diff service | `announcement-snapshot-diff.service.ts` | ✅ |
| Tipos de resposta | `AnnouncementSnapshotDiffResponse`, categorias semânticas | ✅ |
| GET `/snapshots/diff` | `baseSnapshotId` + `compareSnapshotId` | ✅ |
| GET `/snapshots/:id/diff-latest` | Diff vs. último snapshot do device | ✅ |
| GET `/snapshots/timeline` | Linha do tempo append-only por `deviceId` | ✅ |
| RBAC | `viewer` / `operator` / `admin` leem; ninguém executa | ✅ |
| Feature flag | `BGP_ANNOUNCEMENT_MATRIX_ENABLED` | ✅ |
| UI Histórico | Seleção, comparar, filtros, badges | ✅ |
| UI card resumo | Última mudança entre par consecutivo | ✅ |
| Compatibilidade legacy | Snapshots sem `semanticView` enriquecidos on-the-fly | ✅ |
| Selftests | Suite `snapshot-timelapse-diff` (15 casos) | ✅ |
| Runtime smoke | Device 94, snapshots 192 → 193 | ✅ |
| Docs | Spec + closure | ✅ |

**Fora de escopo:** apply, execute, Controlled Execution, SSH/SNMP/connector, preview/plan automático a partir do diff, Config Generator, Copilot.

---

## 3. Arquitetura

```
bgp_announcement_matrix_snapshots (append-only)
        │
        ├── listMatrixSnapshotSummaries()  ── timeline
        ├── getMatrixSnapshotById()        ── carrega matriz enriquecida
        │
        ▼
computeAnnouncementSnapshotDiff(base, compare)
        │
        ├── diffTargets / diffCommunities / diffPolicies
        ├── diffProtectedGlobals / diffConflicts / diffMetadata
        │
        ▼
AnnouncementSnapshotDiffResponse  { readOnly: true, changes[], summary, riskHints }

UI (netops-manager)
        │
        ├── SnapshotHistoryPanel  ── checkboxes base/compare + Comparar snapshots
        ├── SnapshotDiffPanel     ── resumo, filtros, lista de mudanças
        └── SnapshotDiffSummaryCard (AnnouncementPanel) ── par mais recente
```

### Snapshots append-only

- Cada refresh (`POST /snapshots/refresh`, modo `database_only`) insere novo registro.
- IDs monotônicos por device; comparação sempre **base (mais antigo) → compare (mais recente)**.
- Cross-device bloqueado com `422 CROSS_DEVICE`.

### Diff service

- Arquivo: `workspace/artifacts/api-server/src/modules/bgp-announcements/announcement-snapshot-diff.service.ts`
- Funções exportadas: `computeAnnouncementSnapshotDiff`, `diffAnnouncementSnapshots`, `diffSnapshotToLatest`, `getAnnouncementSnapshotTimeline`
- Não persiste, não cria preview, não cria change plan.

### Timeline endpoint

- `GET /api/bgp/announcements/snapshots/timeline?deviceId=`
- Retorna snapshots ordenados (mais recente primeiro) com `isLatest` e `previousSnapshotId`.

### UI Histórico

| Componente | Papel |
|------------|-------|
| `SnapshotHistoryPanel.tsx` | Tabela de snapshots, seleção base/compare, botão **Comparar snapshots** |
| `SnapshotDiffPanel.tsx` | Resumo, filtros, badges, lista de mudanças, botão fechar |
| `AnnouncementPanel.tsx` | Queries React Query, card **Última mudança entre snapshots** |

### Filtros e badges

Filtros: Todas · Clientes/ORIGIN · Upstream auditoria · Globais protegidos · Conflitos · Metadados.

Badges por tipo: Adicionado · Removido · Alterado · Conflito novo · Conflito resolvido · Global protegido · Auditoria upstream.

---

## 4. Endpoints

| Método | Path | RBAC | Descrição |
|--------|------|------|-----------|
| GET | `/api/bgp/announcements/snapshots/diff?baseSnapshotId=&compareSnapshotId=` | `read` | Diff semântico entre dois snapshots |
| GET | `/api/bgp/announcements/snapshots/:id/diff-latest` | `read` | Diff do snapshot vs. último do mesmo device |
| GET | `/api/bgp/announcements/snapshots/timeline?deviceId=` | `read` | Timeline append-only |

Erros: `404` (snapshot ausente), `422` (cross-device), `409` (formato incompatível), `503` (feature flag off).

Ordem de registro de rotas (evita conflito com `:id`): `diff` → `timeline` → `latest` → lista → `:id/diff-latest` → `:id`.

---

## 5. Modelo de diff

Categorias principais validadas em selftest e runtime:

| Tipo | Significado | Semântica |
|------|-------------|-----------|
| `target_added` | Target novo na matriz | Pode ser Cliente/ORIGIN ou outro role |
| `target_removed` | Target ausente no compare | Sem ação automática |
| `target_changed` | Células/prefixos alterados | Cliente/ORIGIN — elegível a análise futura |
| `community_added` | Community nova em célula | Potencial candidato a preview manual |
| `community_removed` | Community removida | Sem sugestão automática |
| `conflict_added` | Novo conflito real | Severidade `critical` |
| `conflict_resolved` | Conflito resolvido | Informativo |
| `protected_global_changed` | Global protegido alterou metadados | Nunca sugere remoção automática |
| `upstream_audit_changed` | Mudança em target `audit_only` | Somente auditoria |
| `metadata_changed` | Contadores, status ou warnings | Observado no smoke 192 → 193 |

Tipos adicionais implementados (spec completa): `community_changed`, `policy_added`, `policy_removed`, `policy_changed`, `protected_global_added`, `protected_global_removed`, `conflict_changed`.

Cada change inclui: `severity`, `targetId`, `targetName`, `targetRole`, `targetEditMode`, `before`, `after`, `explanation`, `isEditableTarget`, `isProtectedGlobal`, `isAuditOnly`.

---

## 6. Garantias read-only

| Garantia | Evidência |
|----------|-----------|
| Não cria preview | Diff service não importa `announcement-change-preview.service.ts` |
| Não cria change plan | Diff service não importa `announcement-change-plan-link.service.ts` |
| Não executa SSH | Sem imports `ssh2`; selftest valida |
| Não executa SNMP | Sem imports `net-snmp` |
| Não chama connector | Sem `connector-snmp` / jobs connector |
| Não chama Controlled Execution | `snapshotDiffSafetyTokens()` documenta tokens proibidos |
| Resposta explícita | `readOnly: true` em diff e timeline |
| UI explícita | Banner: *"não gera Change Preview nem Change Plan automaticamente"* |

---

## 7. Smoke runtime (2026-06-10)

| Item | Valor |
|------|-------|
| Device | **94** — `4WNET-BVA-BRT-RB` |
| Base snapshot | **192** (`2026-06-13T19:00:26Z`, 2 rows) |
| Compare snapshot | **193** (`2026-06-13T21:14:50Z`, 2 rows) |
| Resultado | 1 change: `metadata_changed` (warnings de idade da coleta) |
| `readOnly` | `true` |
| `riskHints` | *"Comparação read-only — não cria preview nem change plan."* |
| Timeline | **3 snapshots** para device 94 |
| Logs API | Sem SSH/SNMP/connector no fluxo `/snapshots/diff` |
| Typecheck | `pnpm run typecheck` — OK |
| Containers | `api` + `web` rebuildados e healthy |

---

## 8. UI validada

| Elemento | Comportamento validado |
|----------|------------------------|
| Aba **Histórico** | Lista snapshots com checkboxes Base/Compare |
| **Comparar snapshots** | Dispara GET `/snapshots/diff` |
| Resumo | Badges de targets, communities, conflitos |
| Filtros | Clientes/ORIGIN, auditoria, globais, conflitos, metadados |
| Banner amber | Read-only explícito |
| Card resumo | Última mudança entre par consecutivo (se houver changes) |
| Ausência apply/execute | Nenhum botão de execução no fluxo diff |

URL: `http://localhost:3005/netops-operations?view=bgp-announcements&deviceId=94` → aba **Histórico**.

---

## 9. Selftests

Runner:

```bash
node tools/bgp-announcement-snapshot-timelapse-diff-selftest.mjs
# ou
node tools/bgp-announcement-selftest-suites.mts snapshot-timelapse-diff
```

Resultado: **15/15 passed**

Casos cobertos: same device, cross-device block, target/community/conflict/protected_global/upstream_audit changes, legacy snapshots, viewer RBAC, feature flag off, sem preview/plan, sem SSH/SNMP/connector/Controlled Execution.

---

## 10. Limitações conhecidas

- **Cross-device** — comparação bloqueada (`422`); diff sempre no contexto de um device.
- **Não substitui Change Preview** — estados propostos e ticket markdown não são gerados pelo diff.
- **Não cria Change Plan** — link preview → plan permanece fluxo separado e manual.
- **Upstreams na matriz** — export/upstream fora da matriz principal; mudanças de auditoria upstream podem aparecer como `upstream_audit_changed` quando row audit_only existe.
- **Snapshots incompatíveis** — formato legado corrompido retorna `409`; refresh necessário.
- **Metadata-only diffs** — refresh consecutivo sem mudança de config pode gerar apenas `metadata_changed` (warnings de idade, contadores).
- **Sem apply/execute** — diff é observabilidade; implementação continua fora do NetOps nesta fase.

---

## 11. Próximas fases recomendadas

1. **Diff → preview sugerido (manual)** — botão opcional "Abrir Change Preview" a partir de change `target_changed` / `community_*` em Cliente/ORIGIN (sem automação).
2. **Export timeline** — CSV/Markdown do diff para ticket externo.
3. **Alertas de regressão** — notificação quando `conflict_added` ou `protected_global_removed` entre snapshots consecutivos.
4. **Controlled Execution Adapter** — somente após flags explícitas + RBAC `execute` (fase futura, fora do MVP read-only).
5. **Integração ticket externo** — Jira/GLPI a partir do resumo do diff.

---

## 12. Checklist operacional

- [ ] API/Web healthy (`docker compose ps`)
- [ ] Feature enabled (`GET /api/bgp/announcements/feature`)
- [ ] Pelo menos 2 snapshots existentes para o device (`GET /snapshots?deviceId=`)
- [ ] Comparar par desejado via UI Histórico ou GET `/snapshots/diff`
- [ ] Revisar filtros: Clientes/ORIGIN vs auditoria vs globais vs conflitos
- [ ] Confirmar `readOnly: true` na resposta
- [ ] Confirmar ausência de preview/plan criados automaticamente
- [ ] Se `metadata_changed` only — verificar idade da coleta (`warnings` no meta)
- [ ] Conflitos novos (`conflict_added`) — revisar aba Conflitos antes de preview manual
- [ ] Globais protegidos alterados — nunca interpretar como sugestão de remoção
- [ ] Logs sem SSH/SNMP/connector no fluxo diff

---

## 13. Smoke test manual (repetível)

Pré-requisitos: sessão autenticada (`ADMIN_EMAIL` / `ADMIN_PASSWORD`); API `:8085`, Web `:3005`.

```bash
cd workspace && pnpm run typecheck

# Login (ajustar credenciais)
curl -s -c /tmp/netops_cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"..."}' \
  http://127.0.0.1:8085/api/auth/login

# Diff 192 → 193 (device 94)
curl -s -b /tmp/netops_cookies.txt \
  "http://127.0.0.1:8085/api/bgp/announcements/snapshots/diff?baseSnapshotId=192&compareSnapshotId=193" \
  | python3 -m json.tool

# Timeline
curl -s -b /tmp/netops_cookies.txt \
  "http://127.0.0.1:8085/api/bgp/announcements/snapshots/timeline?deviceId=94" \
  | python3 -m json.tool

# Diff-latest
curl -s -b /tmp/netops_cookies.txt \
  "http://127.0.0.1:8085/api/bgp/announcements/snapshots/192/diff-latest" \
  | python3 -m json.tool

# Selftests
node tools/bgp-announcement-snapshot-timelapse-diff-selftest.mjs

# UI
open "http://localhost:3005/netops-operations?view=bgp-announcements&deviceId=94"
# → aba Histórico → selecionar base 192, compare 193 → Comparar snapshots
```

Segurança (logs):

```bash
docker compose logs api --since 10m | rg "/snapshots/diff|/snapshots/timeline" | rg -i "ssh|snmp|connector|controlled|execute|apply" || echo OK
```

Validações esperadas:

- `readOnly: true`
- `changes` array (pode ser vazio ou conter `metadata_changed` entre refreshs sem mudança de config)
- `riskHints` inclui aviso read-only
- Timeline retorna snapshots com `isLatest` no primeiro item
- UI mostra banner read-only; sem botões apply/execute

---

## Referências

- [Snapshot Timelapse Diff — spec](./BGP_ANNOUNCEMENT_SNAPSHOT_TIMELAPSE_DIFF.md)
- [MVP Read-Only Closure](./BGP_ANNOUNCEMENT_MVP_READONLY_CLOSURE.md)
- [Integration Map](./BGP_ANNOUNCEMENT_MATRIX_INTEGRATION_MAP.md)
- [Policy Graph Model](./BGP_POLICY_GRAPH_MODEL.md)
- [Change Preview](./BGP_ANNOUNCEMENT_CHANGE_PREVIEW.md)
