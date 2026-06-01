# Cursor — NetOps (roteamento)

**Objetivo:** evitar busca global, carregar só o contexto do domínio, seguir workflow fixo.

## 1. Escolha o domínio (agente)

| Tarefa / palavras-chave | Agente | Skill |
|-------------------------|--------|-------|
| L2, VSI, L2VC, refresh, RN-141, `/l2-circuits` | [agents/l2-circuits.md](./agents/l2-circuits.md) | `skills/l2-circuits-ops/` |
| BGP, SNMP_FAST, drilldown, pilot | [agents/bgp-snmp.md](./agents/bgp-snmp.md) | `skills/bgp-snmp-ops/` |
| Connector, WireGuard, bastion, agent | [agents/connectors.md](./agents/connectors.md) | `skills/connectors-ops/` |
| UI, página, shadcn, React, tabela | [agents/frontend-noc.md](./agents/frontend-noc.md) | `skills/frontend-feature/` |
| Compliance, findings, policy | [agents/compliance.md](./agents/compliance.md) | `skills/compliance-ops/` |
| API route, controller, OpenAPI | [agents/api-platform.md](./agents/api-platform.md) | `skills/api-endpoint/` |
| Schema, migration, Drizzle | [agents/db-schema.md](./agents/db-schema.md) | `skills/db-schema/` |
| Validar, smoke, selftest, CI | [agents/qa-smoke.md](./agents/qa-smoke.md) | `skills/netops-smoke-validation/` |
| Parser Huawei CLI (L2 ou BGP) | [agents/huawei-parser.md](./agents/huawei-parser.md) | `skills/huawei-vrp-parsers/` |
| Provisioning context / memory | [agents/provisioning-context-maintainer.md](./agents/provisioning-context-maintainer.md) | docs-only |
| Provisioning preview / findings | [agents/provisioning-validator.md](./agents/provisioning-validator.md) | `skills/netops-smoke-validation/` |
| Provisioning safety / RBAC | [agents/provisioning-security-reviewer.md](./agents/provisioning-security-reviewer.md) | `skills/compliance-ops/` |
| Provisioning docs / phase notes | [agents/provisioning-docs-writer.md](./agents/provisioning-docs-writer.md) | docs-only |
| Provisioning regression | [agents/provisioning-regression-runner.md](./agents/provisioning-regression-runner.md) | `skills/netops-smoke-validation/` |

## 2. Siga o workflow

| Intenção | Workflow |
|----------|----------|
| Corrigir bug L2 / parser / refresh | [workflows/l2-change.md](./workflows/l2-change.md) |
| Novo endpoint API | [workflows/api-endpoint.md](./workflows/api-endpoint.md) |
| Nova tela / feature UI | [workflows/frontend-feature.md](./workflows/frontend-feature.md) |
| Migration Drizzle | [workflows/db-migration.md](./workflows/db-migration.md) |
| Fechar fase / validar | [workflows/phase-validation.md](./workflows/phase-validation.md) |
| Rebuild containers | [workflows/deploy-containers.md](./workflows/deploy-containers.md) |
| Investigar flag OFF / 503 / pilot | [workflows/feature-flag-debug.md](./workflows/feature-flag-debug.md) |
| Provisioning context refresh | [workflows/provisioning-context-refresh.md](./workflows/provisioning-context-refresh.md) |
| Provisioning validation | [workflows/provisioning-validation.md](./workflows/provisioning-validation.md) |
| Provisioning security review | [workflows/provisioning-security-review.md](./workflows/provisioning-security-review.md) |
| Provisioning docs refresh | [workflows/provisioning-docs-refresh.md](./workflows/provisioning-docs-refresh.md) |
| Provisioning regression | [workflows/provisioning-regression.md](./workflows/provisioning-regression.md) |

## 3. Rules automáticas (globs)

| Rule | Quando |
|------|--------|
| `rules/00-routing.mdc` | Sempre — roteamento antes de explorar |
| `rules/netops-core.mdc` | Sempre — safety |
| `rules/l2-circuits.mdc` | `modules/l2circuits/**` |
| `rules/api-server.mdc` | `api-server/**` |
| `rules/frontend.mdc` | `netops-manager/**` |

## 4. Docs de referência (só se agente pedir)

| Doc | Uso |
|-----|-----|
| `docs/ai/MODULES.md` | Mapa de módulos |
| `docs/ai/FLOWS.md` | Sequências |
| `docs/ai/DEPENDENCIES.md` | Env flags |
| `docs/ai/TESTING.md` | Lista selftests |
| `AGENTS.md` | Safety + comandos globais |

**Não ler** `reports/` nem `docs/` inteiros sem necessidade explícita.
