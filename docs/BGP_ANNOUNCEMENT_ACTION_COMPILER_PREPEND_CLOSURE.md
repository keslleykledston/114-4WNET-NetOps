# BGP Announcement Action Compiler — Prepend Preview Closure

**Data:** 2026-06-10  
**Branch:** `codex/bgp-peer-dedupe`  
**Commit de implementação:** `6b37e77` — `feat(bgp-announcements): add read-only prepend action previews`  
**Status:** ✅ Fase `BGP-ANNOUNCEMENTS.ACTION-COMPILER-PREPEND` fechada — validada em runtime (device 94, previews #10–11, plan #29)

Documento oficial de encerramento da fase de **preview lógico/documental** para `set_prepend` e `clear_prepend` na BGP Announcement Matrix. Nenhum comando vendor, apply, Controlled Execution ou execução em device faz parte desta fase.

---

## 1. Resumo executivo

A BGP Announcement Matrix passa a suportar **Change Preview read-only** para alterações lógicas de AS-PATH prepend em targets **Cliente/ORIGIN**:

- `set_prepend` e `clear_prepend` deixam de retornar `unsupported_preview` para targets `editable_future`.
- Serviço dedicado `announcement-prepend-preview.service.ts` gera diff estruturado, `riskHints` e seção de ticket **Prepend / AS-PATH**.
- `prependCount` validado (inteiro 1–10); `upstreamCircuitId` obrigatório.
- UI `ChangePreviewModal` com input de prepend, banner read-only e exibição de hints.
- Draft Change Plan e Review Workflow preservam `logicalDiff` e `ticketMarkdown` — sem execução.

Runtime smoke concluído em **device 94**: preview **#11** (`set_prepend`), **#10** (`clear_prepend`), plan **#29** (`draft`). Typecheck OK. Selftests prepend **14/14**, change-preview **15/15**, change-plan-link **12/12**, review workflow OK.

---

## 2. Escopo entregue

| Item | Entrega | Status |
|------|---------|--------|
| Prepend service | `announcement-prepend-preview.service.ts` | ✅ |
| Integração Change Preview | `announcement-change-preview.service.ts` | ✅ |
| Tipos estruturados | `ChangePreviewPrependDiffEntry`, `ChangePreviewLogicalDiffItem` | ✅ |
| `set_prepend` | Preview lógico com `prependCount` 1–10 | ✅ |
| `clear_prepend` | Preview lógico com no-op documental quando ausente | ✅ |
| `riskHints` | Hints operacionais por ação | ✅ |
| Ticket Markdown | Seção **Prepend / AS-PATH** | ✅ |
| Change Plan adapter | `logicalDiffItemsToStrings()` em metadata | ✅ |
| Change Plan link | `normalizeLinkedLogicalDiff()` | ✅ |
| UI | Input prependCount, upstream, banner, hints | ✅ |
| Selftests | Suite `prepend-preview` (14 casos) | ✅ |
| Runtime smoke | Device 94, previews #10–11, plan #29 | ✅ |
| Docs | Spec + closure | ✅ |

**Fora de escopo:** comandos vendor, `route-policy`, apply, execute, Controlled Execution, SSH/SNMP/connector, Config Generator, Copilot, vendor command compiler.

---

## 3. Arquitetura

```
MatrixRow (Cliente/ORIGIN editable_future)
        │
        ▼
createAnnouncementChangePreview()
  actionType: set_prepend | clear_prepend
  upstreamCircuitId + prependCount (set only)
        │
        ├── validateTargetForPreview()
        ├── validatePrependCount()          (set_prepend)
        ├── detectPrependForUpstream()    (cell.prependCount)
        │
        ▼
announcement-prepend-preview.service.ts
  ├── buildPrependStructuredDiff()
  ├── buildPrependLogicalDiff()
  ├── buildSet/ClearPrependProposedState()
  ├── buildSet/ClearPrependRiskHints()
  └── buildPrependTicketSection()
        │
        ▼
AnnouncementChangePreview
  logicalDiff[]  (string | ChangePreviewPrependDiffEntry)
  riskHints[]
  ticketMarkdown  (inclui ## Prepend / AS-PATH)
        │
        ▼ (opcional, manual)
createChangePlanFromPreview()
  └── bgp-announcement-preview.adapter.ts
        logicalDiffItemsToStrings() → change_plans.metadata
        │
        ▼
Review Workflow → approved_for_manual_implementation (sem execução)
```

### Componentes

| Camada | Artefato |
|--------|----------|
| Prepend logic | `announcement-prepend-preview.service.ts` |
| Orquestração | `announcement-change-preview.service.ts` |
| Tipos | `bgp-announcement.types.ts` |
| Change Plan | `bgp-announcement-preview.adapter.ts`, `announcement-change-plan-link.service.ts` |
| UI | `ChangePreviewModal.tsx`, `AnnouncementPanel.tsx` |

---

## 4. Ações suportadas

| Ação | Target | Parâmetros | Saída |
|------|--------|------------|-------|
| `set_prepend` | Cliente/ORIGIN `editable_future` | `upstreamCircuitId`, `prependCount` (1–10) | Diff before/after prepend, riskHints, ticket |
| `clear_prepend` | Cliente/ORIGIN `editable_future` | `upstreamCircuitId` | Remoção lógica; warning se prepend não detectável |

Nenhuma ação gera script Huawei/Cisco ou chama `compileAnnouncementPreview()` para prepend.

---

## 5. Validações

### Obrigatório / permitido

| Regra | Implementação |
|-------|---------------|
| Cliente/ORIGIN | `targetRole` ∈ `{customer, origin}` |
| `editable_future` | `targetEditMode === "editable_future"` |
| `upstreamCircuitId` | Obrigatório para ambas ações |
| `prependCount` | Inteiro 1–10 (`PREPEND_COUNT_MIN/MAX`) |
| Snapshot válido | `loadMatrixForPreview()` |

### Bloqueado

| Condição | Resultado |
|----------|-----------|
| `provider` / `upstream` / `ix` / `cdn` / `ibgp` / `unknown` | `validation.status=blocked` |
| `audit_only` / `hidden` | `blocked` |
| `protected_global` / `protected_system` | `blocked` |
| `prependCount` ausente, 0, negativo, > 10 | `blocked` |
| Export policy como alvo | `blocked` |

### Warnings

- `clear_prepend` sem prepend em `cell.prependCount` → no-op documental
- Substituição de prepend existente
- `dependencyScope=global_shared`

---

## 6. UI (Change Preview Modal)

| Elemento | Comportamento |
|----------|---------------|
| Ações | `set_prepend` / `clear_prepend` no seletor |
| Upstream | Obrigatório (select Cxx) |
| `prependCount` | Input numérico 1–10 (`set_prepend` only) |
| Banner amber | *Preview lógico/documental — nenhum comando vendor real* |
| Diff | Linhas legíveis + objetos estruturados formatados |
| `riskHints` | Lista dedicada abaixo do diff |
| Botões | Gerar preview, Criar plano — **sem execute/apply** |

URL: `http://localhost:3005/netops-operations?view=bgp-announcements&deviceId=94` → **Gerar preview** em row Cliente/ORIGIN.

---

## 7. Ticket Markdown

Seção obrigatória **## Prepend / AS-PATH**:

- Ação (`set_prepend` / `clear_prepend`)
- Target Cliente/ORIGIN e upstream selecionado
- Valor atual detectado (`cell.prependCount`, `unknown` ou `none`)
- Valor proposto
- Riscos operacionais (`riskHints`)
- Confirmação:
  - *Nenhum comando foi executado.*
  - *Preview lógico/documental. Implementação deve ser manual ou por fase futura aprovada.*

Validado em runtime: ticket **sem** `route-policy` ou `apply as-path`.

---

## 8. Runtime smoke (2026-06-10)

| Item | Valor |
|------|-------|
| Device | **94** — `4WNET-BVA-BRT-RB` |
| Snapshot | **193** |
| Target | `AS264196-RORAIMANET-IMPORT-IPV4:10:ipv4` (customer, `editable_future`) |
| `set_prepend` preview | **#11** — `prependCount=3`, upstream `01` |
| `clear_prepend` preview | **#10** — upstream `15`, `validation=warning` (prepend não detectável) |
| Draft Change Plan | **#29** — `workflowStatus=draft` a partir de preview #11 |
| Ticket | Seção Prepend / AS-PATH presente |
| Comandos vendor | Ausentes |
| Logs API | Sem SSH/SNMP/connector/Controlled Execution no fluxo change-preview |

---

## 9. Selftests

```bash
node tools/bgp-announcement-prepend-preview-selftest.mjs      # 14/14
node tools/bgp-announcement-change-preview-selftest.mjs       # 15/15
node tools/bgp-announcement-change-plan-link-selftest.mjs     # 12/12
node tools/change-plans-review-workflow-selftest.mjs          # OK
```

Casos prepend cobertos: Cliente/ORIGIN permitido, prependCount inválido/alto, upstream/provider bloqueados, global protegido, logicalDiff estruturado, ticket, riskHints, Draft Change Plan, sem vendor command, sem SSH/SNMP/connector/Controlled Execution.

---

## 10. Garantias de segurança

| Garantia | Evidência |
|----------|-----------|
| Sem comandos vendor | Ticket e preview sem `route-policy` / `apply as-path` |
| Sem `route-policy` gerado | Selftest + runtime smoke |
| Sem SSH | Nenhum import `ssh2` nos módulos prepend/preview |
| Sem SNMP | Nenhum import `net-snmp` |
| Sem connector | Nenhum `connector-snmp` |
| Sem Controlled Execution | Tokens proibidos ausentes |
| Sem apply/execute | UI e API sem rotas de execução |
| Read-only | Preview persiste diff lógico; plan permanece `draft` até revisão manual |

---

## 11. Limitações conhecidas

- **Detecção de prepend atual** — depende de `cell.prependCount` no snapshot; se ausente, `before.prepend` pode ser `unknown` ou `null`.
- **Sem parsing AS-PATH completo** — não inspeciona `apply as-path` em route-policy export do snapshot bruto nesta fase.
- **Sem comandos reais** — implementação permanece manual no equipamento.
- **Sem cálculo global de engenharia de tráfego** — não modela impacto em todos os upstreams/prefixos simultaneamente.
- **Upstream export continua audit_only** — prepend preview opera no contexto Cliente/ORIGIN import; export Cxx não é editável.
- **Vendor Command Compiler** — relação futura explícita; fase posterior com flags e RBAC dedicados.

---

## 12. Próximas fases recomendadas

1. **Vendor Command Compiler (prepend)** — gerar script documental a partir do diff estruturado (sem apply automático).
2. **Parsing AS-PATH enriquecido** — detectar prepend existente a partir de policy nodes no snapshot parseado.
3. **Impacto multi-upstream** — simulação read-only de preferência quando vários Cxx anunciam o mesmo prefixo.
4. **Diff → preview sugerido** — atalho manual de timelapse diff para Change Preview prepend.
5. **Controlled Execution Adapter** — somente após aprovação explícita e RBAC `execute` (fora do MVP read-only).

---

## 13. Checklist operacional

- [ ] API/Web healthy (`docker compose ps`)
- [ ] Feature enabled + preview enabled (`GET /api/bgp/announcements/feature`)
- [ ] Target Cliente/ORIGIN com `editable_future` identificado na matriz
- [ ] Upstream correto selecionado (Cxx da marcação import)
- [ ] `prependCount` entre 1 e 10 para `set_prepend`
- [ ] Preview gerado — revisar diff estruturado e `riskHints`
- [ ] Ticket Markdown contém seção **Prepend / AS-PATH**
- [ ] Confirmar ausência de comandos vendor no ticket
- [ ] Draft Change Plan criado se necessário (`draft` only)
- [ ] Review Workflow até `approved_for_manual_implementation` se aplicável
- [ ] Implementação manual no equipamento — **fora do NetOps nesta fase**
- [ ] Logs sem SSH/SNMP/connector no fluxo change-preview

---

## 14. Smoke test manual (repetível)

Pré-requisitos: sessão autenticada; API `:8085`, Web `:3005`; snapshot **193** no device **94**.

```bash
cd workspace && pnpm run typecheck

# Login
curl -s -c /tmp/netops_cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"..."}' \
  http://127.0.0.1:8085/api/auth/login

# Obter target editable_future
curl -s -b /tmp/netops_cookies.txt \
  "http://127.0.0.1:8085/api/bgp/announcements/matrix?deviceId=94" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); r=next(x for x in d['rows'] if x.get('targetEditMode')=='editable_future'); print(r['targetKey'])"

TARGET="AS264196-RORAIMANET-IMPORT-IPV4:10:ipv4"

# set_prepend
curl -s -b /tmp/netops_cookies.txt -X POST -H "Content-Type: application/json" \
  -d "{\"deviceId\":94,\"snapshotId\":193,\"targetId\":\"$TARGET\",\"actionType\":\"set_prepend\",\"upstreamCircuitId\":\"01\",\"prependCount\":3}" \
  http://127.0.0.1:8085/api/bgp/announcements/change-preview \
  | python3 -m json.tool

# clear_prepend
curl -s -b /tmp/netops_cookies.txt -X POST -H "Content-Type: application/json" \
  -d "{\"deviceId\":94,\"snapshotId\":193,\"targetId\":\"$TARGET\",\"actionType\":\"clear_prepend\",\"upstreamCircuitId\":\"15\"}" \
  http://127.0.0.1:8085/api/bgp/announcements/change-preview \
  | python3 -m json.tool

# Draft Change Plan (substituir PREVIEW_ID)
curl -s -b /tmp/netops_cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{}' \
  http://127.0.0.1:8085/api/bgp/announcements/change-preview/PREVIEW_ID/create-plan

# Selftests
node tools/bgp-announcement-prepend-preview-selftest.mjs
node tools/bgp-announcement-change-preview-selftest.mjs

# UI
open "http://localhost:3005/netops-operations?view=bgp-announcements&deviceId=94"
```

Validações esperadas:

- `validation.status` ∈ `{ok, warning}` (não `unsupported_preview`)
- `logicalDiff` contém objeto `operation: "set_prepend"` ou `"clear_prepend"`
- `ticketMarkdown` inclui `## Prepend / AS-PATH` e *Nenhum comando foi executado*
- Ausência de `route-policy` no ticket
- Plan criado com `workflowStatus=draft`

Segurança (logs):

```bash
docker compose logs api --since 10m | rg "change-preview" | rg -i "ssh|snmp|connector|controlled|execute|apply" || echo OK
```

---

## Referências

- [Prepend Preview — spec](./BGP_ANNOUNCEMENT_ACTION_COMPILER_PREPEND.md)
- [Change Preview](./BGP_ANNOUNCEMENT_CHANGE_PREVIEW.md)
- [Change Plan Link](./BGP_ANNOUNCEMENT_CHANGE_PLAN_LINK.md)
- [MVP Read-Only Closure](./BGP_ANNOUNCEMENT_MVP_READONLY_CLOSURE.md)
- [Integration Map](./BGP_ANNOUNCEMENT_MATRIX_INTEGRATION_MAP.md)
