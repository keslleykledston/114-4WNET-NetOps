# Phase 8 Release Candidate Report

## Objetivo

Consolidar o módulo Connectors / Bastião para release estável com migrations automáticas, smoke único, hardening de segredos e documentação de E2E real.

## Entregas

- Runner de migrations SQL idempotente com tabela `schema_migrations` e lock concorrente
- Smoke único: `tools/connectors-release-smoke.mjs`
- Secret leak selftest: `tools/secrets-leak-selftest.mjs`
- Documentação de RC, deploy, checklist E2E e troubleshooting
- Atualização do TODO com status da trilha

## Validação local

- `pnpm run typecheck`
- `BASE_PATH=/ PORT=5000 pnpm run build`
- `docker compose build`
- `tools/apply-containers.sh api web`
- `curl /api/healthz`
- `tools/connectors-release-smoke.mjs`
- `tools/secrets-leak-selftest.mjs`

## Status

- API e web devem subir com o container `migrate` aplicando SQL pendente automaticamente.
- O histórico de migrations fica persistido no banco.
- O smoke único cobre health, RBAC, credential vault, connector groups, notifications, config history, provisioning preview, export e OpenAPI.
- O leak test cobre respostas de leitura e export com valores sensíveis conhecidos.

## Pendências operacionais

- Executar o checklist E2E real em um device de laboratório antes de promover para produção.
- Manter `CONFIG_APPLY_ENABLED=false` até aprovação explícita.
