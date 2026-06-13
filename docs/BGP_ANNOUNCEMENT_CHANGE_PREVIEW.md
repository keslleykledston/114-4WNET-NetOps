# BGP Announcement Change Preview

Read-only flow to propose logical changes on **Cliente/ORIGIN** targets from the BGP Announcement Matrix snapshot.

> **MVP read-only fechado:** ver [`BGP_ANNOUNCEMENT_MVP_READONLY_CLOSURE.md`](./BGP_ANNOUNCEMENT_MVP_READONLY_CLOSURE.md)

## O que é

- Proposta de alteração (`announcementChangePreview`) com estado atual/proposto, diff lógico, riscos e ticket Markdown.
- Persistência append-only em `bgp_announcement_change_previews`.
- Compilação a partir de **snapshot persistido** + config parseada já no banco (quando disponível).
- `proposedCommands[]` pode ser gerado apenas como documentação para revisão humana, com vendor draft explícito.
- **Nenhum comando** é gerado para execução nesta fase como apply — o ticket é documentação operacional.

## O que não é

- Não executa SSH, SNMP, connector ou discovery real.
- Não chama Controlled Execution ou Config Generator.
- Não altera equipamento nem aplica configuração.
- Não edita upstream/provider/IX/CDN (audit_only).
- Não remove objetos globais protegidos.

## Targets permitidos

| Condição | Permitido |
|----------|-----------|
| `targetRole` = `customer` ou `origin` | Sim |
| `targetEditMode` = `editable_future` | Sim |
| Import policy (não export Cxx) | Sim |

## Targets bloqueados

| Condição | Resultado |
|----------|-----------|
| `provider` / `upstream` / `ix` / `cdn` | `validation.status=blocked` |
| `unknown` / `ibgp` / `hidden` | Bloqueado |
| `protected_global` / `protected_system` como alvo de alteração | Bloqueado |
| Export policy | Bloqueado |

## actionTypes

| actionType | Suporte nesta fase |
|------------|-------------------|
| `set_community` | Sim (via compilador + diff lógico) |
| `add_community` / `remove_community` | Sim (diff lógico; remove global bloqueado) |
| `block_announcement` / `allow_announcement` | Sim |
| `set_prepend` / `clear_prepend` | Sim (preview lógico/documental — [`spec`](./BGP_ANNOUNCEMENT_ACTION_COMPILER_PREPEND.md) · [`closure`](./BGP_ANNOUNCEMENT_ACTION_COMPILER_PREPEND_CLOSURE.md)) |
| `audit_only_note` | Apenas auditoria (bloqueado em target editável) |

## Risk assessment

| Nível | Quando |
|-------|--------|
| `blocked` | Target não editável, global protegido, ação inválida, compilador bloqueou |
| `high` | Conflito real, community ambígua, impacto multi-cliente |
| `medium` | Dados incompletos, dependência compartilhada |
| `low` | Cliente/ORIGIN, diff simples, sem conflito |

## Endpoints

| Método | Path | RBAC |
|--------|------|------|
| POST | `/bgp/announcements/change-preview` | `bgp.announcements.preview` |
| GET | `/bgp/announcements/change-preview/:id` | `bgp.announcements.read` |
| GET | `/bgp/announcements/change-preview?snapshotId=&targetId=` | `bgp.announcements.read` |

Feature flags: `BGP_ANNOUNCEMENT_MATRIX_ENABLED` + `BGP_ANNOUNCEMENT_PREVIEW_ENABLED`.

## Ticket Markdown

Inclui obrigatoriamente:

- Título, alvo, snapshot, ação proposta
- Estado atual / proposto / diff lógico
- Riscos e validações
- Globais protegidos e impacto upstream (auditoria)
- Seção **Comandos Propostos / Não Executados** quando houver `proposedCommands[]`
- Observações:
  - **Nenhum comando foi executado.**
  - Preview gerado a partir de snapshot persistido.
  - Objetos globais não devem ser removidos.
  - Upstreams são auditoria, não alvo de edição nesta fase.

Ver formato: [`BGP_ANNOUNCEMENT_VENDOR_DRAFT_COMMANDS.md`](./BGP_ANNOUNCEMENT_VENDOR_DRAFT_COMMANDS.md) · [`closure`](./BGP_ANNOUNCEMENT_VENDOR_DRAFT_COMMANDS_CLOSURE.md)

## UI

Aba **Clientes / ORIGIN**:

- Botão **Gerar preview** por linha editável
- Modal com seleção de `actionType`, campos condicionais, diff, riscos, ticket
- Copiar / baixar markdown — **sem apply/execute**

Aba **Auditoria Upstreams**: aviso audit-only, sem preview editável.

Aba **Dependências Globais**: proteção documentada, sem ação de remoção.

## Relação futura

- **Change Plans** (módulo separado): poderá referenciar `announcementChangePreview.id` como input de plano draft — sem import cruzado nesta fase.
- **Controlled Execution**: permanece bloqueado por flags; preview não dispara execução.

## Validação

```bash
cd workspace && pnpm run typecheck
node tools/bgp-announcement-change-preview-selftest.mjs
node tools/bgp-announcement-change-plan-link-selftest.mjs
```

## Change Plan Link

Ver [`BGP_ANNOUNCEMENT_CHANGE_PLAN_LINK.md`](./BGP_ANNOUNCEMENT_CHANGE_PLAN_LINK.md).

## Vendor Draft

Ver [`BGP_ANNOUNCEMENT_VENDOR_DRAFT_COMMANDS.md`](./BGP_ANNOUNCEMENT_VENDOR_DRAFT_COMMANDS.md) e [`closure`](./BGP_ANNOUNCEMENT_VENDOR_DRAFT_COMMANDS_CLOSURE.md).
