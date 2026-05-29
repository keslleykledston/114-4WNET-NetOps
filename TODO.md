# TODO

## v0.4.x — Provisioning Operacional Seguro (Planned — aguardando aprovação)

Plano: `reports/V0_4_PROVISIONING_OPERATIONAL_PLAN.md`

### v0.4.0 — Preview Engine
- [ ] Completar templates: interface/subinterface, route-policy, community, prefix-list
- [ ] Selftest `tools/provisioning-preview-selftest.mjs`
- [ ] Unificar seed `config_templates` ↔ `SERVICE_TEMPLATES`
- [ ] Manter `CONFIG_APPLY_ENABLED=false`

### v0.4.1 — Provisioning UI
- [ ] `/templates`: view read-only (viewer), edit (operator/admin)
- [ ] Wizard `/provisioning`: RBAC por botão, preview side-by-side
- [ ] Export plano Markdown/JSON

### v0.4.2 — Approval Workflow
- [ ] Estados rejected + audit timeline UI
- [ ] Permissão `provisioning.approve`
- [ ] Janela manutenção + rollback plan obrigatórios

### v0.4.3 — Dry-run Validation
- [ ] Pré-check vs discovery_snapshots (VRF, interface, BGP)
- [ ] Bloqueio por findings BLOCKER_REAL
- [ ] Detecção conflito VLAN/VRF/BGP/policy

### v0.4.4 — Controlled Apply Readiness (doc only)
- [ ] Documentar requisitos para `CONFIG_APPLY_ENABLED=true`
- [ ] Design dupla aprovação + SSH adapter Huawei
- [ ] **Não habilitar apply em piloto**

---

## v0.3.4 — Operational Pilot NOC (In Development)

- [ ] TAREFA 1: Select pilot devices (3 devices, create device matrix) — ✅ DONE
- [ ] TAREFA 2: Full operational workflow per device (test, discover, BGP, compliance, export)
- [ ] TAREFA 3: Operational health dashboard (total devices, SSH OK, SNMP OK, recent activity)
- [ ] TAREFA 4: NOC operational checklist (pre-shift, daily ops, handoff) — ✅ DONE
- [ ] TAREFA 5: Incident runbook (7 categories, 20+ scenarios) — ✅ DONE
- [ ] TAREFA 6: UX feedback checklist (rating template, pain points, suggestions) — ✅ DONE
- [ ] TAREFA 7: Operational pilot smoke test (validate workflow end-to-end) — ✅ DONE
- [ ] TAREFA 8: Documentation final (update README, CHANGELOG, ROADMAP, PROJECT_STATUS) — 🔄 IN PROGRESS
- [ ] TAREFA 9: Final validation (typecheck, build, docker, all selftests) — PENDING

## ✅ v0.3.3 — Compliance Report Export (Completed)

- ✅ Botão download na UI compliance.
- ✅ Gerador de relatório Markdown/JSON/CSV.
- ✅ Filtro por job com findings e evidence sanitizada.
- ✅ Incluir summary severidade/contexto/categoria.
- ✅ Endpoints para findings export e groups export.
- ✅ Sanitização com redação de senhas/tokens/secrets.
- ✅ Permissões via compliance.export.
- ✅ Audit logging de todas ações de export.
- ✅ Selftest suite (16/16 tests).

## ✅ v0.3.0-v0.3.2 — Completed Features

- ✅ v0.3.0: Gestão de usuários com tela `/users`, CRUD, reset de senha, permissões granulares.
- ✅ v0.3.1: Import/Export de dispositivos com preview, validação, deduplicação, audit trail.
- ✅ v0.3.2: Download/export de relatórios (merged into v0.3.3).

## v0.3.4 — Pilot operacional NOC (Planned)

- Validação com operadores reais em NOC.
- Feedback de UX, performance e operabilidade.
- Ajustes de densidade visual (dark mode, tabelas compactas).
- Monitoramento de uptime dashboard.
- Alerts em tempo real para findings críticos.
- Streaming de relatórios para datasets grandes (>10k findings).
- Email delivery de relatórios.

## v0.2.9+ Roadmap (Em Andamento)

- Decide whether production deploys use Drizzle `push` or SQL migration files for discovery schema rollout.
- Keep the manifest-first Docker install path and pnpm cache mount; do not regress to whole-workspace preinstall copy.
- Expand route-policy parser coverage for platform-specific Huawei VRP variants.
- Keep `CONFIG_APPLY_ENABLED=false` by default and require explicit approval before any real apply path.
- Expand audit/report UI filters and add export/download flows.
- Move `tools/device-discovery-selftest.mjs` checks into the formal test runner when one is added.
- Add threshold configuration for BGP route counters in compliance v2.
- Add more Huawei VRP fixtures for VRF/L2VPN edge cases in compliance v2.
- Expand password reset / disable user / session revoke UX for local RBAC (v0.3.0).
- Decide whether `cron_expression` becomes live in the next release or stays metadata only.
- Test v0.2.3 NetBox read-only sync with a real NetBox lab.
- Keep NetBox write-back out of scope until explicit design approval.
