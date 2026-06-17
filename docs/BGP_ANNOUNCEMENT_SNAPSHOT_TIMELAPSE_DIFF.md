# BGP Announcement Matrix — Snapshot Timelapse Diff

**Data:** 2026-06-10  
**Fase:** `BGP-ANNOUNCEMENTS.SNAPSHOT-TIMELAPSE-DIFF`  
**Status:** ✅ Fechado — ver [`BGP_ANNOUNCEMENT_SNAPSHOT_TIMELAPSE_DIFF_CLOSURE.md`](./BGP_ANNOUNCEMENT_SNAPSHOT_TIMELAPSE_DIFF_CLOSURE.md)  
**Commit:** `4cabd2c` — `feat(bgp-announcements): add snapshot timelapse diff`

---

## 1. Objetivo

Permitir **comparação read-only** entre dois snapshots materializados da BGP Announcement Matrix, visualizando mudanças históricas sem gerar Change Preview, Change Plan ou qualquer execução.

Casos de uso:

- Entender o que mudou entre refreshs consecutivos (ex.: snapshot **192 → 193** no device **94**).
- Auditar mudanças em upstreams (somente leitura).
- Detectar novos conflitos ou conflitos resolvidos.
- Rastrear alterações em objetos globais protegidos.
- Identificar targets Cliente/ORIGIN candidatos a análise futura (preview manual).

---

## 2. Snapshots append-only

Snapshots em `bgp_announcement_matrix_snapshots` são **append-only**:

- Cada `POST /snapshots/refresh` cria um novo registro.
- Snapshots antigos permanecem imutáveis.
- O diff **nunca altera** snapshots existentes.

---

## 3. Endpoints

| Método | Path | RBAC | Descrição |
|--------|------|------|-----------|
| GET | `/api/bgp/announcements/snapshots/diff?baseSnapshotId=&compareSnapshotId=` | `bgp.announcements.read` | Diff entre dois IDs |
| GET | `/api/bgp/announcements/snapshots/:id/diff-latest` | `bgp.announcements.read` | Diff do snapshot vs. último do mesmo device |
| GET | `/api/bgp/announcements/snapshots/timeline?deviceId=` | `bgp.announcements.read` | Linha do tempo append-only |

Feature flag: `BGP_ANNOUNCEMENT_MATRIX_ENABLED` (503 quando off).

Erros:

- `404` — snapshot não encontrado
- `422` — snapshots de devices diferentes (`CROSS_DEVICE`)
- `409` — formato incompatível (refresh necessário)

---

## 4. Modelo de resposta

```json
{
  "baseSnapshot": { "id": 192, "deviceId": 94, "createdAt": "...", "rowCount": 2, "status": "ok", "conflictCount": 0 },
  "compareSnapshot": { "id": 193, "deviceId": 94, "createdAt": "...", "rowCount": 2, "status": "ok", "conflictCount": 0 },
  "summary": {
    "addedTargets": 0,
    "removedTargets": 0,
    "changedTargets": 0,
    "addedCommunities": 0,
    "removedCommunities": 0,
    "newConflicts": 0,
    "resolvedConflicts": 0,
    "protectedGlobalChanges": 0,
    "upstreamAuditChanges": 0
  },
  "changes": [],
  "byTargetRole": {},
  "byDependencyScope": {},
  "riskHints": [],
  "readOnly": true
}
```

Cada item em `changes`:

| Campo | Descrição |
|-------|-----------|
| `type` | Categoria semântica (ver §5) |
| `severity` | `info` \| `warning` \| `critical` |
| `targetId` / `targetName` | Identificação do target afetado |
| `targetRole` / `targetEditMode` | Semântica Cliente/ORIGIN vs auditoria |
| `before` / `after` | Estado comparado |
| `explanation` | Texto operacional |
| `isEditableTarget` | Cliente/ORIGIN elegível para análise futura |
| `isProtectedGlobal` | Objeto global protegido |
| `isAuditOnly` | Mudança de upstream/auditoria |

---

## 5. Categorias de diff

| Tipo | Significado |
|------|-------------|
| `target_added` | Target novo na matriz |
| `target_removed` | Target ausente no snapshot mais recente |
| `target_changed` | Células ou prefixos alterados (Cliente/ORIGIN) |
| `community_added` | Community nova em célula |
| `community_removed` | Community removida |
| `community_changed` | Community substituída no mesmo circuito |
| `policy_added` | Route-policy passou a compor a matriz |
| `policy_removed` | Route-policy deixou a matriz |
| `policy_changed` | (reservado para metadados de policy) |
| `protected_global_added` | Objeto global rastreado |
| `protected_global_removed` | Objeto global sumiu — **sem sugestão automática de remoção** |
| `protected_global_changed` | Metadados/consumidores de global alteraram |
| `conflict_added` | Novo conflito real |
| `conflict_resolved` | Conflito resolvido |
| `conflict_changed` | Conflito alterado |
| `upstream_audit_changed` | Mudança em target `audit_only` (upstream) |
| `metadata_changed` | Contadores, status ou warnings do snapshot |

---

## 6. Semântica operacional

### Cliente / ORIGIN (`editable_future`)

- Mudanças aparecem como `target_changed`, `community_*`.
- `isEditableTarget: true`.
- `riskHints` indicam candidatos a **Change Preview manual** — nunca automático.

### Upstreams (`audit_only`)

- Mudanças classificadas como `upstream_audit_changed`.
- `isAuditOnly: true`.
- Não elegíveis a preview nesta fase.

### Globais protegidos

- Mudanças em `semanticView.protectedGlobals` → `protected_global_*`.
- Remoção de global **nunca** vira sugestão automática de remoção.
- Severidade `critical` para `protected_global_removed`.

### Conflitos

- `conflict_added` → severidade `critical`.
- `conflict_resolved` → informativo; revisar antes de preview.

---

## 7. UI — aba Histórico

| Elemento | Comportamento |
|----------|---------------|
| Checkboxes Base / Compare | Selecionar dois snapshots distintos |
| **Comparar snapshots** | GET `/snapshots/diff` |
| Resumo | Badges de targets, communities, conflitos |
| Filtros | Todas · Clientes/ORIGIN · Upstream auditoria · Globais · Conflitos · Metadados |
| Banner | Comparação read-only — não gera preview/plan |

Card opcional na tela principal: **Última mudança entre snapshots** (par mais recente vs. anterior).

---

## 8. Garantias read-only

| Garantia | Implementação |
|----------|---------------|
| Sem alteração de snapshots | Diff puro em memória |
| Sem Change Preview | Serviço não importa `announcement-change-preview` |
| Sem Change Plan | Serviço não importa `announcement-change-plan-link` |
| Sem SSH/SNMP/connector | Apenas leitura DB + compare |
| Sem Controlled Execution | `snapshotDiffSafetyTokens()` validado em selftest |
| `readOnly: true` | Sempre presente na resposta |

---

## 9. Compatibilidade com snapshots antigos

Snapshots persistidos antes da Semantic View ainda funcionam:

- `deriveRowSemanticsForLegacySnapshot()` enriquece rows na hora do diff.
- `semanticView` ausente no JSON persistido é reconstruída quando possível.

---

## 10. Exemplo — Snapshot 192 vs 193 (device 94)

```bash
curl -s -b "netops_session=$TOKEN" \
  "http://127.0.0.1:8085/api/bgp/announcements/snapshots/diff?baseSnapshotId=192&compareSnapshotId=193"
```

Expectativa típica após refresh `database_only` consecutivo:

- `metadata_changed` se contadores/warnings mudaram.
- Poucas ou zero mudanças em targets se a config subjacente não alterou.
- `readOnly: true` e `riskHints` incluindo aviso de comparação read-only.

Timeline:

```bash
curl -s -b "netops_session=$TOKEN" \
  "http://127.0.0.1:8085/api/bgp/announcements/snapshots/timeline?deviceId=94"
```

---

## 11. Limitações

- Comparação **cross-device** bloqueada (`422`).
- Diff não substitui Change Preview — estados propostos não são calculados.
- Upstreams fora da matriz principal continuam na aba Auditoria separada.
- Snapshots `incompatible` exigem novo refresh.

---

## 12. Artefatos

| Camada | Path |
|--------|------|
| Diff service | `announcement-snapshot-diff.service.ts` |
| Controller | `bgp-announcement.controller.ts` → `getSnapshotDiff`, `getSnapshotDiffLatest`, `getSnapshotTimeline` |
| UI | `SnapshotHistoryPanel.tsx`, `SnapshotDiffPanel.tsx`, `AnnouncementPanel.tsx` |
| Selftests | `tools/bgp-announcement-selftest-suites.mts` → suite `snapshot-timelapse-diff` |

---

## Referências

- [**Closure oficial**](./BGP_ANNOUNCEMENT_SNAPSHOT_TIMELAPSE_DIFF_CLOSURE.md)
- [MVP Read-Only Closure](./BGP_ANNOUNCEMENT_MVP_READONLY_CLOSURE.md)
- [Integration Map](./BGP_ANNOUNCEMENT_MATRIX_INTEGRATION_MAP.md)
- [Policy Graph Model](./BGP_POLICY_GRAPH_MODEL.md)
- [Change Preview](./BGP_ANNOUNCEMENT_CHANGE_PREVIEW.md)
