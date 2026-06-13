# BGP Announcement Action Compiler — Prepend (Read-Only)

**Data:** 2026-06-10  
**Fase:** `BGP-ANNOUNCEMENTS.ACTION-COMPILER-PREPEND`  
**Status:** Preview lógico/documental — sem comandos vendor

---

## 1. Objetivo

Permitir **Change Preview read-only** para `set_prepend` e `clear_prepend` em targets **Cliente/ORIGIN** (`editable_future`), gerando:

- `logicalDiff` estruturado (before/after prepend por upstream)
- `riskHints` operacionais
- `ticketMarkdown` com seção **Prepend / AS-PATH**

Sem gerar comando Huawei/Cisco real, sem apply, sem Controlled Execution.

---

## 2. Ações suportadas

| Ação | Descrição | Parâmetros |
|------|-----------|------------|
| `set_prepend` | Definir prepend lógico | `upstreamCircuitId`, `prependCount` (1–10) |
| `clear_prepend` | Remover prepend lógico | `upstreamCircuitId` |

---

## 3. Validações

### Permitido

- `targetRole`: `customer` ou `origin`
- `targetEditMode`: `editable_future`
- `dependencyScope`: `customer_specific`, `circuit_specific`, `local`
- Snapshot persistido válido

### Bloqueado

| Condição | Resultado |
|----------|-----------|
| `provider` / `upstream` / `ix` / `cdn` / `ibgp` / `unknown` | `blocked` |
| `audit_only` / `hidden` | `blocked` |
| `protected_global` / `protected_system` | `blocked` |
| `prependCount` ausente, 0, negativo, não-inteiro, > 10 | `blocked` |
| `upstreamCircuitId` ausente | `blocked` |

### Warnings

- `clear_prepend` sem prepend detectável → no-op documental
- `dependencyScope=global_shared` → revisar impacto
- Substituição de prepend existente

---

## 4. logicalDiff estruturado

```json
{
  "operation": "set_prepend",
  "targetId": "origin:10:ipv4",
  "targetName": "ORIGIN-TEST",
  "upstreamCircuitId": "01",
  "before": { "prepend": 2 },
  "after": { "prepend": 3 },
  "explanation": "Preview lógico para aplicar prepend 3x..."
}
```

Tipo: `ChangePreviewLogicalDiffItem = string | ChangePreviewPrependDiffEntry`.

---

## 5. riskHints

### set_prepend

- Prepend altera preferência conforme política upstream
- Validar se upstream aceita AS-PATH prepend
- Validar Local-AS / replace-as / allowas-in
- Múltiplos upstreams no mesmo prefixo
- Implementação manual — sem comando gerado

### clear_prepend

- Remoção pode aumentar preferência do caminho
- Validar engenharia de tráfego ativa
- Impacto em redundância
- No-op se prepend não detectável

---

## 6. Ticket Markdown

Seção obrigatória **## Prepend / AS-PATH** com:

- Ação, target, upstream, valor detectado, valor proposto
- Riscos operacionais
- Confirmação: *Nenhum comando foi executado.* + *Preview lógico/documental.*

---

## 7. Change Plan e Review Workflow

- Preview `set_prepend` / `clear_prepend` elegível para **Draft Change Plan**
- `logicalDiff` serializado via `logicalDiffItemsToStrings()` no adapter
- `ticketMarkdown` preservado em metadata
- Review Workflow → `approved_for_manual_implementation` (sem execução)

---

## 8. Limitações

- **Não gera** `route-policy`, `apply as-path` ou script vendor
- Prepend detectado apenas quando `cell.prependCount` existe no snapshot
- Export/upstream permanecem `audit_only`
- Vendor Command Compiler = fase futura explícita

---

## 9. Artefatos

| Camada | Path |
|--------|------|
| Prepend logic | `announcement-prepend-preview.service.ts` |
| Integration | `announcement-change-preview.service.ts` |
| Change Plan adapter | `bgp-announcement-preview.adapter.ts` |
| UI | `ChangePreviewModal.tsx` |
| Selftests | suite `prepend-preview` |

---

## Referências

- [Change Preview](./BGP_ANNOUNCEMENT_CHANGE_PREVIEW.md)
- [Change Plan Link](./BGP_ANNOUNCEMENT_CHANGE_PLAN_LINK.md)
- [MVP Read-Only Closure](./BGP_ANNOUNCEMENT_MVP_READONLY_CLOSURE.md)
