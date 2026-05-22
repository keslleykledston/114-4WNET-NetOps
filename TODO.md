# TODO

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
