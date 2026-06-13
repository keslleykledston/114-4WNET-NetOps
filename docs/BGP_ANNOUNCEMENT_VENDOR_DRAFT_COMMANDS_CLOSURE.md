# BGP Announcement Vendor Draft Commands - Closure

**Data:** 2026-06-13  
**Fase:** `BGP-ANNOUNCEMENTS.VENDOR-DRAFT-COMMANDS-CLOSURE`  
**Status:** ✅ Fechado

Fechamento oficial da fase documental de comandos propostos para BGP Announcement Matrix. Nenhum comando foi executado. Nenhum fluxo de apply, execute ou Controlled Execution entrou nesta fase.

---

## 1. Resumo executivo

Fase fechou geração de `proposedCommands[]` como artefato documental:

- aparece no Change Preview
- aparece no `ticketMarkdown`
- é preservado no Draft Change Plan
- é copiável como texto com aviso explícito
- continua sem execução automática

Suporte inicial: Huawei VRP. Vendor desconhecido retorna `unsupported_vendor` e lista vazia.

---

## 2. Escopo entregue

- `announcement-vendor-draft.service.ts`
- integração com Change Preview
- integração com Change Plan
- `proposedCommands[]` persistido em preview e plan
- UI com seção documental e confirmação antes de copiar
- selftests cobrindo segurança, preservação e bloqueios

---

## 3. Arquitetura

### 3.1 Service

`workspace/artifacts/api-server/src/modules/bgp-announcements/announcement-vendor-draft.service.ts`

Responsável por:

- ler `AnnouncementChangePreview`
- detectar vendor suportado
- gerar `proposedCommands[]` documental
- gerar warnings
- manter `scope=documental_only`
- manter `safety=not_executable`

Sem SSH. Sem SNMP. Sem connector. Sem Controlled Execution.

### 3.2 Change Preview

`announcement-change-preview.service.ts`:

- monta preview lógico
- chama vendor draft compiler
- grava `proposedCommands[]` e `proposedCommandsWarnings`
- inclui seção `Comandos Propostos / Não Executados` no `ticketMarkdown`

### 3.3 Change Plan

`bgp-announcement-preview.adapter.ts` e `change-plans.markdown.ts`:

- preservam `proposedCommands[]` no snapshot e metadata
- preservam `proposedCommandsWarnings`
- mantêm markdown documental

### 3.4 UI

- `ChangePreviewModal`
- `ChangePlanDetailsModal`
- helper `proposed-commands.ts`

---

## 4. Formato `proposedCommands[]`

Campos principais:

- `vendor`
- `scope = documental_only`
- `safety = not_executable`
- `confidence`
- `commandSetName`
- `actionType`
- `commands[]`
- `warnings[]`

Cada line de `commands[]` é marcada como:

- `kind`
- `confidence`
- `requiresHumanReview = true`
- `notes[]`

---

## 5. Ações suportadas

- `add_community` quando dependência específica
- `remove_community` quando dependência específica
- `block_announcement` quando target elegível
- `set_prepend`
- `clear_prepend`

Quando confiança insuficiente:

- `proposedCommands[]` vazio
- warning explica motivo

---

## 6. Segurança semântica

- Cliente/ORIGIN elegível
- `provider` / `upstream` / `IX` / `CDN` bloqueados
- `protected_global` bloqueado para remoção
- `protected_system` nunca gera comando
- preview `blocked` não gera commandSet elegível
- `proposedCommands[]` nunca entra em executor

---

## 7. UI

Entrega:

- seção `Comandos Propostos / Não Executados`
- badge `Documental only`
- badge confidence
- aviso antes de copiar
- sem botão Executar / Aplicar

Observação:

- clique manual em modal/copy não foi validado com browser automatizado
- validação aconteceu por build, typecheck, API autenticada e runtime smoke

---

## 8. Runtime smoke

Validado em lab:

- device `94`
- snapshot `193`
- `set_prepend`
- `proposedCommands[]` gerado
- Draft Change Plan preservou `proposedCommands[]`
- `ticketMarkdown` preservado

---

## 9. Selftests

- change-preview `15/15`
- prepend-preview `15/15`
- change-plan-link `12/12`
- review workflow OK
- vendor-draft `10/10`

---

## 10. Garantias

- nenhum comando executado
- sem SSH
- sem SNMP
- sem connector
- sem Controlled Execution
- sem apply
- sem execute

---

## 11. Limitações conhecidas

- comandos são proposta documental
- não colar sem revisão humana
- suporte inicial só Huawei VRP
- vendor desconhecido pode retornar `unsupported_vendor`
- clique manual/copy UI ainda pede smoke visual dedicado

---

## 12. Checklist operacional

- confirmar target elegível
- confirmar vendor
- revisar warnings
- revisar confidence
- revisar texto antes de copiar
- colar manualmente só após revisão humana

---

## 13. Smoke test manual repetível

1. Login local como admin.
2. Abrir matrix device 94.
3. Escolher target `customer` ou `origin`.
4. Gerar preview `set_prepend` ou `add_community`.
5. Confirmar `proposedCommands[]`.
6. Criar Draft Change Plan.
7. Confirmar preservação em preview, plan e markdown.
8. Confirmar nenhum apply/execute.

---

## 14. Próximas fases

1. Smoke visual dedicado da UI copy modal.
2. Vendor draft coverage extra por vendor, se surgir novo suporte.
3. Continuação de documentação de manual implementation workflow.

---

## Links

- [`BGP_ANNOUNCEMENT_VENDOR_DRAFT_COMMANDS.md`](./BGP_ANNOUNCEMENT_VENDOR_DRAFT_COMMANDS.md)
- [`BGP_ANNOUNCEMENT_CHANGE_PREVIEW.md`](./BGP_ANNOUNCEMENT_CHANGE_PREVIEW.md)
- [`BGP_ANNOUNCEMENT_CHANGE_PLAN_LINK.md`](./BGP_ANNOUNCEMENT_CHANGE_PLAN_LINK.md)
- [`BGP_ANNOUNCEMENT_MATRIX_INTEGRATION_MAP.md`](./BGP_ANNOUNCEMENT_MATRIX_INTEGRATION_MAP.md)
