# Community Sets Legacy Extraction and Migration Plan

Data: 2026-06-04

Escopo:
- Extracao do legado `60-bgp_manager` apenas para referencia.
- Nenhuma alteracao no legado.
- Uso direto da extracao para orientar a migracao no projeto atual `114-4WNET-NetOps`.

## 1) Tabela: arquivo -> funcao -> campos -> classes CSS

| Arquivo legado | Funcao principal | Campos/dados principais | Classes CSS/Tailwind chave |
|---|---|---|---|
| `frontend/src/pages/CommunitiesPanel.jsx` | Container do painel por device; alterna entre Biblioteca e Community Sets; gating por permissao | `device`, `canView`, `canEdit`, `canPreview`, `canApply`, `tab` | `flex flex-col gap-5`, `flex gap-1 p-1 rounded-lg bg-[#161922] border border-[#252840] w-fit`, `px-4 py-1.5 rounded-md text-[12px]` |
| `frontend/src/components/CommunityLibraryTable.jsx` | Busca, sync backup/live e tabela da biblioteca de community-filter | `q`, `debounced`, `rows`, `loading`, `resyncing`, `resyncingLive`, `err` | `overflow-x-auto rounded-lg border border-[#252840]`, `thead bg-[#161922]`, `hover:bg-[#1a1d2e]`, `font-mono text-[11px]` |
| `frontend/src/components/CommunitySetEditor.jsx` | Lista lateral de sets, detalhe lateral, create/edit/clone/compare/preview/apply/delete | `sets`, `library`, `editingId`, `readOnlyView`, `name`, `vrpName`, `desc`, `memberIds`, `memberSearch`, `applyModal`, `compareModal` | `grid grid-cols-1 lg:grid-cols-2 gap-4`, `rounded-lg border border-[#252840]`, `bg-[#11141c]`, `bg-brand-blue-dim`, `text-[8px] uppercase`, `text-amber-300`, `text-emerald-300` |
| `frontend/src/components/CommunityApplyConfirmModal.jsx` | Confirma apply, mostra warnings, comando e preview, exige confirmações | `preview`, `ack`, `ackMissing`, `busy`, `err`, `needsMissingAck`, `commandLines` | `fixed inset-0 z-50`, `max-w-2xl`, `bg-[#13151f]`, `bg-[#0f111a]`, `border-[#252840]`, `text-amber-200`, `text-red-200` |
| `frontend/src/api/communities.js` | Client HTTP da feature | Endpoints `library`, `resyncFromConfig`, `resyncLive`, `listSets`, `getSet`, `createSet`, `updateSet`, `deleteSet`, `cloneSet`, `compareSets`, `previewSet`, `applySet`, `setUsage` | N/A |
| `frontend/src/App.jsx` | Registra a view `communities` no painel de devices | `selected.view === 'communities'`, breadcrumb, `showDevicePanel` | N/A |
| `frontend/src/components/DeviceTree.jsx` | Inclui `Communities` na árvore de views do device quando há permissão | `deviceViews`, `hasPermission('communities.view')` | `w-56`, `bg-[#13151f]`, `border-r border-[#1e2235]` |
| `backend/app/routers/communities.py` | API completa da feature | Rotas de library, sync, listSets, compare, clone, get, update, delete, preview, apply, usage | N/A |
| `backend/app/schemas_communities.py` | Contratos de API | `CommunityLibraryItemOut`, `CommunitySetMemberOut`, `CommunitySetOut`, `CommunitySetCreate`, `CommunitySetUpdate`, `CommunityPreviewOut`, `CommunityApplyRequest`, `CommunityApplyResultOut`, `CommunityResyncResult`, `CommunitySetCompareIn`, `CommunitySetCompareOut`, `CommunitySetCloneIn`, `CommunitySetUsageOut` | N/A |
| `backend/app/models.py` | ORM | `CommunityLibraryItem`, `CommunitySet`, `CommunitySetMember`, `CommunitySyncAudit`, `CommunityChangeAudit` | N/A |
| `backend/app/services/community_sync_service.py` | Importa do running-config salvo ou live SSH, liga membros à biblioteca, grava auditoria | `IMPORTED_COMMUNITY_SET_ORIGINS`, `latest_running_config_text`, `resolve_library_link_for_value`, `resync_from_saved_configuration`, `resync_from_live_device`, `sync_communities_from_config_text` | N/A |
| `backend/app/services/community_apply_service.py` | Preview, SHA, validação e apply via SSH | `build_candidate_config_text`, `build_preview`, `latest_successful_preview`, `apply_community_set`, `record_audit` | N/A |

## 2) Resumo por arquivo

### `frontend/src/pages/CommunitiesPanel.jsx`
- Controla o switch entre Biblioteca e Community Sets.
- Faz o gating por permissao.
- Define o cabeçalho da tela e o device atual.

### `frontend/src/components/CommunityLibraryTable.jsx`
- Leitura server-side da biblioteca.
- Sync backup e sync live atualizam a lista.
- A tabela eh uma view de inventario, sem edicao.

### `frontend/src/components/CommunitySetEditor.jsx`
- Eh o centro da feature.
- O fluxo eh: selecionar set -> editar/preparar -> preview -> comparar -> apply.
- Sets importados aparecem como read-only.
- Sets `app_created` sao editaveis.
- O compare eh um diff local/servidor entre dois sets do mesmo device.

### `frontend/src/components/CommunityApplyConfirmModal.jsx`
- E a ultima trava antes de apply.
- Explicita o risco de members sem biblioteca.
- Mostra o comando e o bloco final que vao para o device.

### `frontend/src/api/communities.js`
- Centraliza o contrato HTTP do feature.
- O projeto atual deve manter esse contrato como referencia funcional.

### `backend/app/routers/communities.py`
- E a superficie real do backend para o feature.
- Suporta o ciclo completo: sync -> list -> preview -> apply -> usage.

### `backend/app/schemas_communities.py`
- Define a forma dos objetos consumidos pelo frontend.
- E o melhor ponto de compatibilidade para migracao.

### `backend/app/models.py`
- Define a persistencia do feature.
- A estrutura de `community_sets` + `community_set_members` e o baseline a preservar.

### `backend/app/services/community_sync_service.py`
- Responsavel pela descoberta/importacao.
- Preserva a distinção entre origem importada e set criado pela app.

### `backend/app/services/community_apply_service.py`
- Responsavel pela seguranca do preview/apply.
- O apply nunca deve ser exposto sem confirmacao, hash e auditoria.

## 3) Shape resumido dos objetos

### `CommunitySetOut`
```json
{
  "id": 10,
  "device_id": 4,
  "company_id": 2,
  "name": "Clientes Core",
  "slug": "clientes-core",
  "vrp_object_name": "CLIST_CLIENTES_CORE",
  "origin": "app_created",
  "discovered_members": [],
  "implied_config_preview": "ip community-list CLIST_CLIENTES_CORE ...",
  "description": "Opcional",
  "status": "draft",
  "created_by": 1,
  "updated_by": 1,
  "members": [
    {
      "id": 99,
      "position": 0,
      "community_value": "65001:100",
      "linked_library_item_id": 501,
      "missing_in_library": false,
      "linked_filter_name": "CLIST_CUSTOMERS",
      "value_description": "Linha VRP"
    }
  ],
  "members_total": 1,
  "members_resolved": 1,
  "members_missing": 0
}
```

### `CommunityLibraryItemOut`
```json
{
  "id": 501,
  "device_id": 4,
  "company_id": 2,
  "filter_name": "CLIST_CUSTOMERS",
  "community_value": "65001:100",
  "match_type": "basic",
  "action": "permit",
  "index_order": 1,
  "origin": "discovered_running_config",
  "description": "Entrada ip community-filter basic",
  "tags_json": ["customer", "core"],
  "is_system": false,
  "is_active": true,
  "usage_count": 3
}
```

### `CommunityPreviewOut`
```json
{
  "candidate_config_text": "ip community-list CLIST_CLIENTES_CORE ...",
  "candidate_sha256": "64hex...",
  "warnings": [],
  "members_missing_library": 1,
  "missing_community_values": ["65001:999"]
}
```

### `CommunitySetCompareOut`
```json
{
  "set_a_id": 10,
  "set_b_id": 11,
  "set_a_name": "Clientes Core",
  "set_b_name": "Clientes Backup",
  "set_a_origin": "app_created",
  "set_b_origin": "discovered_live",
  "members_a_sorted": ["65001:100", "65001:101"],
  "members_b_sorted": ["65001:100", "65001:102"],
  "only_in_a": ["65001:101"],
  "only_in_b": ["65001:102"],
  "in_both": ["65001:100"]
}
```

## 4) Plano de migracao para o projeto atual

### Premissas
- Nao alterar o legado.
- Preservar o contrato backend atual.
- Manter `CONFIG_APPLY_ENABLED=false` como padrao.
- Evitar copiar a UI literalmente; replicar comportamento e densidade.
- Usar o backend atual como base e completar apenas o que faltar.

### Fase 1 — Congelar contrato e alinhar shape
1. Validar que o backend atual expõe o mesmo conjunto funcional:
   - library
   - resync backup/live
   - list/get/create/update/delete
   - clone
   - compare
   - preview
   - apply
   - usage
2. Garantir que o shape do frontend atual continue compatível com:
   - `origin`
   - `status`
   - `members[]`
   - `missing_in_library`
   - `implied_config_preview`
   - `candidate_sha256`
3. Se faltar algum campo, preferir adaptar o schema do backend atual e nao o legado.

### Fase 2 — Paridade de layout
1. Separar visualmente:
   - biblioteca
   - lista de community sets
   - painel de detalhe
2. Aplicar densidade semelhante ao legacy:
   - lista lateral mais alta
   - detalhe com scroll proprio
   - spacing vertical compacto
3. Manter o tema shadcn/Tailwind atual.

### Fase 3 — Paridade funcional
1. Manter:
   - leitura de biblioteca
   - resync backup/live
   - leitura de sets
   - create/edit/delete de `app_created`
   - clone de importados
   - compare
   - preview
   - apply com confirmacao dupla
2. Garantir que sets importados fiquem read-only.
3. Exibir claramente quando membros nao existem na biblioteca.

### Fase 4 — Reducao de risco
1. Nao habilitar write real sem flag.
2. Nao quebrar rotas ou hooks existentes.
3. Nao introduzir novos endpoints para o compare se o backend atual ja cobre o fluxo.
4. Reforcar auditoria e hash no preview/apply.

### Fase 5 — Handoff e validação
1. Registrar no handoff do projeto atual o que foi mapeado e o que foi migrado.
2. Manter report de divergencias entre legacy e atual.
3. Validar:
   - `pnpm run typecheck`
   - build do frontend
   - smoke do fluxo de communities
4. Repetir apenas no projeto atual, sem tocar no legado.

## 5) Ordem sugerida de implementacao no projeto atual

1. Ajustar o componente de Communities para ficar fiel ao layout:
   - lista lateral maior
   - detalhe com altura dedicada
   - spacing mais compacto
2. Garantir que a biblioteca mostre tags, estado, origem e uso.
3. Garantir que a lista de sets mostre:
   - origem
   - status
   - membros totais
   - membros ausentes
4. Garantir diff/compare no painel de detalhe.
5. Garantir modal de preview/apply com warnings e SHA.
6. Atualizar documentação/handoff após cada fase.

## 6) Classes CSS/Tailwind que valem como referencia funcional

- `bg-[#10131a]`
- `bg-[#11141c]`
- `bg-[#161922]`
- `border-[#252840]`
- `border-brand-blue`
- `bg-brand-blue-dim`
- `text-ink-muted`
- `text-ink-secondary`
- `text-amber-200`
- `text-emerald-200`
- `text-red-400`
- `rounded-lg`
- `rounded-xl`
- `font-mono`
- `text-[10px]`
- `text-[11px]`
- `text-[12px]`
- `overflow-y-auto`
- `divide-y divide-[#252840]`
- `hover:bg-[#1a1d2e]`

## 7) Resultado esperado da migracao

- O projeto atual deve manter a funcionalidade do legacy para Community Sets.
- A UI deve ficar visualmente equivalente no comportamento, nao necessariamente literal.
- O backend atual continua como fonte de verdade.
- O legado permanece intocado.
