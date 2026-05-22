# TODO

## v0.3.0 — Gestão de usuários

- Criar tela `/users` com CRUD de usuários.
- Adicionar schema de permissões granulares por módulo.
- Implementar reset de senha com token temporário.
- Adicionar session timeout configurável.
- Implementar session revoke manual.
- Audit log para todas ações de usuário.

## v0.3.1 — Import/Export dispositivos

- Implementar parser de CSV/XLSX com preview pré-aplicação.
- Validação de IP/hostname e deduplicação.
- Proteger credenciais no import (não sobrescrever se existente).
- Endpoint de export (CSV/XLSX/JSON).
- Sanitizar secrets na exportação.
- Histórico de imports com audit trail.

## v0.3.2 — Download/export compliance

- Botão download na UI compliance.
- Gerador de relatório Markdown/JSON/CSV.
- Filtro por job com findings e evidence sanitizada.
- Incluir summary severidade/contexto/categoria.

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
