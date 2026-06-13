# Config Generator MVP — Fechamento oficial

**Fase:** `CONFIG-GENERATOR.MVP-CLOSURE`  
**Status:** MVP preview-only **fechado**  
**Data de referência:** 2026-06

Documentos relacionados: [CONFIG_GENERATOR_MVP.md](./CONFIG_GENERATOR_MVP.md) · [ID_ALLOCATOR.md](./ID_ALLOCATOR.md) · [CHANGE_REQUEST_PREVIEW.md](./CHANGE_REQUEST_PREVIEW.md) · [TEMPLATES_L2VPN.md](./TEMPLATES_L2VPN.md) · [PROVISIONING_PREVIEW_ONLY.md](../provisioning/PROVISIONING_PREVIEW_ONLY.md)

---

## 1. Resumo executivo

O MVP de Provisioning/Config Generator entrega um fluxo **preview-only** para operadores NOC gerarem, validarem e documentarem mudanças de configuração Huawei (BGP Cliente com Community, L2VPN VLAN) **sem enviar comandos a dispositivos**.

A UI principal é `/provisioning`; a engine oficial é o módulo **Config Generator** (`/config-generator` como rota técnica). O backend de provisioning legado **não foi reativado**. Controlled Execution **não é invocado**.

Por padrão: `CONFIG_GENERATOR_ENABLED=false`, `CONFIG_WRITE_ENABLED=false`.

---

## 2. Escopo entregue

| Área | Entregue |
|------|----------|
| Templates Huawei | BGP Cliente (Community), L2VPN VLAN |
| Validação + render | Preview, save run, artifacts |
| Suggestions | Tenant, device, interface, service context (dados reais) |
| ID Allocator | Ranges K3G, inventário, suggest/validate |
| Diff/precheck | Textual + semântico vs baseline |
| Change Request Preview | Pacote consolidado + ticket markdown |
| Risk assessment | Determinístico: low / medium / high / blocked |
| UI | `/provisioning` + painéis integrados |
| API + OpenAPI | Endpoints documentados, RBAC |
| Testes | Selftests + typecheck global OK |

**Fora do escopo MVP:** apply real, approval operacional, execução SSH/SNMP pelo Config Generator, integração Controlled Execution.

---

## 3. Arquitetura final

```
┌─────────────────────────────────────────────────────────────┐
│  /provisioning (UI principal)  ──reexport──►  config-generator│
│  /config-generator (rota técnica, mesma UI)                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Config Generator engine (api-server/modules/config-generator)│
│  ├── catalog + engine (render, validate, sanitize)           │
│  ├── suggestions.service (inventory, discovery, BGP, catalog)│
│  ├── id-ranges + id-inventory + id-allocator                 │
│  ├── diff.service (precheck_diff, semantic_diff)             │
│  └── change-request-preview.service                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL: config_generator_* tables + artifacts           │
│  (sem execução; apenas leitura de dados já coletados)        │
└─────────────────────────────────────────────────────────────┘
```

| Componente | Papel |
|------------|-------|
| `/provisioning` | Entrada operacional NOC; alias preview-only |
| `/config-generator` | Mesma UI; rota técnica / debug |
| Config Generator engine | Validate, render, persist runs |
| Suggestions | Pré-preenche tenant/device/template/campos |
| ID Allocator | Sugere VLAN/subif/L2VC/VSI no range K3G |
| Diff/precheck | Compara candidato vs baseline coletado |
| Change Request Preview | Pacote humano-revisável + ticket |
| Artifacts | Histórico append-only por run |

---

## 4. Segurança

| Controle | Implementação |
|----------|---------------|
| Preview-only | Nenhum endpoint apply/execute funcional com write OFF |
| Sem SSH/SNMP pelo CG | ID inventory refresh reprocessa DB apenas |
| Sem apply | `CONFIG_WRITE_ENABLED=false` → 409/501 em approve/execute |
| Flags default OFF | `CONFIG_GENERATOR_ENABLED=false` |
| Secrets | `<SECRET_NOT_STORED>` em input, validation, artifacts, ticket |
| RBAC | `configGenerator.read` / `validate` / `render` / `write` / `admin` |
| Objetos globais | Classificados GLOBAL; nunca remoção automática no rollback |
| Audit | Runs e previews gerados registrados em audit log |

Controlled Execution permanece **desacoplado** — pacote de mudança é insumo documental.

---

## 5. Fluxo operacional

1. **Selecionar tenant/device** — escopo via connectors/tenants.
2. **Escolher template/serviço** — Huawei BGP ou L2VPN VLAN.
3. **Receber sugestões** — inventory, discovery, BGP peers, L2 circuits, service catalog.
4. **Revisar ID Allocator** — VLAN/subinterface/L2VC/VSI sugeridos; override manual permitido.
5. **Validar** — erros bloqueantes impedem save/render.
6. **Gerar preview** — `POST /config-generator/render` → run + artifacts iniciais.
7. **Rodar diff/precheck** — baseline de collected_config / discovery / SNMP.
8. **Gerar pacote de mudança** — Change Request Preview + risk + ticket markdown.
9. **Copiar/baixar ticket markdown** — colar em ticket NOC; revisão humana obrigatória.

---

## 6. Artefatos gerados

Persistidos em `config_generator_artifacts` (append-only por tipo/versão):

| artifact_type | Descrição |
|---------------|-----------|
| `candidate_config` | Script candidato renderizado |
| `postcheck_commands` | Comandos read-only sugeridos pós-mudança |
| `rollback_placeholder` | Notas de rollback **manual** |
| `precheck_diff` | Diff JSON completo vs baseline |
| `semantic_diff` | Alias/ cópia estruturada do diff |
| `diff_notes` | Resumo warnings/errors |
| `ticket_markdown` | Markdown (run inicial + versões enriquecidas) |
| `change_request_preview` | Pacote JSON consolidado |
| `risk_assessment` | Score + factors |
| `implementation_package` | Metadados + checksums do pacote |

---

## 7. Fontes de dados

Leitura **somente** de dados já no banco (sem coleta nova pelo Config Generator):

| Fonte | Uso |
|-------|-----|
| tenants / connectors | Escopo multi-tenant |
| devices | Hostname, vendor, platform, site |
| discovery_snapshots | Interfaces, BGP, L2VPN, policies |
| snmp_snapshots | Interfaces, peers operacionais |
| collected_configs | Baseline textual Huawei |
| l2_circuits | VLANs, circuit IDs |
| service_catalog | Contexto de serviço |
| community library / community sets | Communities BGP |
| BGP announcement tables | Quando disponíveis/exportadas no schema |

---

## 8. ID Allocator (resumo)

- Catálogo **K3G rev. 2026.05** — ver [ID_ALLOCATOR.md](./ID_ALLOCATOR.md).
- **VLAN:** escopo tenant + site/device.
- **Subinterface:** alinhada à VLAN por parent interface/device.
- **L2VC / VSI:** escopo tenant (colisão cross-device).
- Sugestão **revisável**; `fieldOrigins`: `id_allocator` | `manual`.
- Conflito real (ocupado, reservado, bloqueado) → **bloqueia** render/save.

---

## 9. Diff/precheck (resumo)

- **Textual:** linha a linha do candidato.
- **Semântico Huawei:** route-policy, prefix-list, community, interface, VLAN, peer.
- **Baseline:** collected_configs → discovery → SNMP → policy_catalog → none.
- **Status:** already_present, new_candidate, conflict, global_existing/missing, manual_review, unknown_no_baseline.
- **Limites:** sem baseline → unknown; conflito semântico pode marcar `blocking`.

---

## 10. Risk assessment (resumo)

| Nível | Critério típico |
|-------|-----------------|
| `low` | Sem conflitos; baseline OK; candidato new-only |
| `medium` | Global missing, interface down, fora do range VLAN, diff manual_review |
| `high` | Route-policy/VLAN ocupada, baseline ausente, conflitos semânticos |
| `blocked` | Erros de validação bloqueantes ou diff.blocking |

Detalhes: [CHANGE_REQUEST_PREVIEW.md](./CHANGE_REQUEST_PREVIEW.md).

---

## 11. Limitações conhecidas

- **Não executa** comandos em device.
- **Depende** de discovery/SNMP/collected_config prévios para sugestões e diff ricos.
- **Rollback** é placeholder manual; operador valida reversão.
- **BGP Matrix** completa depende de tabelas announcement exportadas/mergeadas no ambiente.
- **Templates** iniciais focados Huawei VRP — BGP Community + L2VPN VLAN.
- **Approval/execute** endpoints existem como stub bloqueado por `CONFIG_WRITE_ENABLED`.
- Provisioning legado no código **não** é rota operacional do MVP.

---

## 12. Habilitar em ambiente controlado

```bash
# .env ou docker-compose (lab/NOC)
CONFIG_GENERATOR_ENABLED=true
CONFIG_WRITE_ENABLED=false   # manter false até fase Controlled Execution
```

Rebuild após alterar flags:

```bash
tools/apply-containers.sh api web
```

Migrar se necessário: `0046`–`0048` (config_generator + id_allocator).

---

## 13. Como validar (automático)

```bash
cd workspace
pnpm --filter @workspace/db build
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/netops-manager run typecheck
pnpm run typecheck
```

Selftests (DATABASE_URL fake — sem DB real):

```bash
export DATABASE_URL=postgres://selftest:selftest@127.0.0.1:1/selftest
export CONFIG_WRITE_ENABLED=false

pnpm --dir ./scripts exec tsx ../artifacts/api-server/src/modules/config-generator/config-generator.selftest.ts
pnpm --dir ./scripts exec tsx ../artifacts/api-server/src/modules/config-generator/config-generator.contract.selftest.ts
pnpm --dir ./scripts exec tsx ../artifacts/api-server/src/modules/config-generator/config-generator.suggestions.selftest.ts
pnpm --dir ./scripts exec tsx ../artifacts/api-server/src/modules/config-generator/config-generator.template-refinement.selftest.ts
pnpm --dir ./scripts exec tsx ../artifacts/api-server/src/modules/config-generator/config-generator.diff.selftest.ts
CONFIG_GENERATOR_ENABLED=true pnpm --dir ./scripts exec tsx ../artifacts/api-server/src/modules/config-generator/config-generator.id-allocator.selftest.ts
CONFIG_GENERATOR_ENABLED=true pnpm --dir ./scripts exec tsx ../artifacts/api-server/src/modules/config-generator/config-generator.change-request-preview.selftest.ts
CONFIG_GENERATOR_ENABLED=true pnpm --dir ./scripts exec tsx ../artifacts/api-server/src/modules/config-generator/config-generator.l2vpn-templates.selftest.ts
pnpm --dir ./scripts exec tsx ../artifacts/netops-manager/src/pages/provisioning-ui-integration.selftest.ts
```

---

## 14. Próximas fases recomendadas

1. **Controlled Execution integration** — consumir `change_request_preview` como entrada de plano; gates humanos.
2. **BGP Matrix deep-link** — enriquecer baseline/diff quando announcement tables estáveis.
3. **Mais templates** — L3VPN, inter-site, outros vendors.
4. **Approval workflow** — com `CONFIG_WRITE_ENABLED` explícito e auditoria reforçada.
5. **Operational smoke HTTP** — script lab com `ADMIN_*` após `CONFIG_GENERATOR_ENABLED=true`.

---

## Checklist de segurança (pré-uso operacional)

Marcar antes de liberar operadores em ambiente com `CONFIG_GENERATOR_ENABLED=true`:

- [ ] `CONFIG_GENERATOR_ENABLED` revisado (habilitar só em lab/NOC controlado)
- [ ] `CONFIG_WRITE_ENABLED=false` confirmado
- [ ] RBAC revisado (viewer / operator / admin)
- [ ] Sem botão apply/execute visível ou funcional na UI
- [ ] Secrets sanitizados em run, artifacts e ticket (sem password/md5 real)
- [ ] Diff/precheck gerado e revisado pelo operador
- [ ] Risk assessment revisado (especialmente `high` / `blocked`)
- [ ] Ticket markdown gerado e copiado para processo NOC
- [ ] Operador revisou manualmente script candidato e rollback placeholder
- [ ] Nenhum comando executado automaticamente pelo sistema

---

## Smoke test manual (lab)

1. Definir `CONFIG_GENERATOR_ENABLED=true`; manter `CONFIG_WRITE_ENABLED=false`.
2. Rebuild `api` + `web`; abrir `/provisioning`.
3. Selecionar tenant e device com discovery/config recente.
4. Confirmar painel de **sugestões** (tenant/device/interface/template).
5. Confirmar **ID Allocator** — ranges K3G e IDs em uso.
6. Preencher/ajustar campos; **Validar** (sem erros bloqueantes).
7. **Gerar preview** — ver blocks + rendered config.
8. **Diff/precheck** — verificar baseline source e ausência de conflitos bloqueantes inesperados.
9. **Gerar Change Request Preview** — ver risk level e ticket markdown.
10. **Copiar/baixar** ticket `.md`; confirmar texto “Nenhum comando foi executado pelo sistema”.
11. Confirmar **ausência** de botões Executar / Aplicar / Aprovar funcionais.
12. (Opcional) Repetir em `/config-generator` — mesma UI.

---

## Critérios de aceite MVP (fechado)

- [x] Preview-only end-to-end documentado e testado
- [x] ID Allocator integrado com ranges K3G
- [x] Diff/precheck vs baseline real
- [x] Change Request Preview + ticket markdown
- [x] Typecheck global OK
- [x] Selftests listados passando
- [x] Provisioning legado não reativado
- [x] Controlled Execution não chamado
- [x] Documentação de closure publicada

**MVP Config Generator / Provisioning preview-only: FECHADO.**
