# System Update Module

Módulo admin para checar nova versão, executar update controlado, acompanhar progresso e fazer rollback automático.

## Arquitetura

- Backend: `workspace/artifacts/api-server/src/modules/system-update/`
- Frontend: `workspace/artifacts/netops-manager/src/pages/system-update.tsx`
- DB: `workspace/lib/db/src/schema/system-update.ts`
- Migration: `workspace/lib/db/migrations/0056_system_update.sql`

## Fluxo

1. `GET /api/system/version` retorna snapshot atual.
2. `POST /api/system/update/check` compara commit local com remote configurado.
3. `POST /api/system/update/run` cria run e dispara runner assíncrono.
4. SSE em `GET /api/system/update/events/:runId` publica etapas.
5. Se etapa crítica falhar, runner tenta rollback automático.
6. Se `SYSTEM_UPDATE_ENABLED=false`, os endpoints retornam `503` e a UI mostra falha de disponibilidade.

## Endpoints

- `GET /api/system/version`
- `GET /api/system/update/status`
- `POST /api/system/update/check`
- `GET /api/system/update/checks`
- `POST /api/system/update/run`
- `GET /api/system/update/runs`
- `GET /api/system/update/runs/:id`
- `GET /api/system/update/runs/:id/steps`
- `POST /api/system/update/runs/:id/cancel`
- `POST /api/system/update/runs/:id/rollback`
- `GET /api/system/update/events/:runId`

## Tabelas

- `system_versions`
- `system_update_checks`
- `system_update_runs`
- `system_update_steps`
- `system_update_backups`

## Variáveis de ambiente

- `SYSTEM_UPDATE_ENABLED=true`
- `SYSTEM_UPDATE_CHANNEL=stable`
- `SYSTEM_UPDATE_GIT_REMOTE=origin`
- `SYSTEM_UPDATE_GIT_BRANCH=main`
- `SYSTEM_UPDATE_GITHUB_REPO=owner/repo`
- `SYSTEM_UPDATE_REQUIRE_CLEAN_TREE=true`
- `SYSTEM_UPDATE_BACKUP_DIR=/var/backups/4wnet-netops`
- `SYSTEM_UPDATE_LOCK_TTL_SECONDS=1800`
- `SYSTEM_UPDATE_STEP_TIMEOUT_SECONDS=600`
- `SYSTEM_UPDATE_HEALTHCHECK_TIMEOUT_SECONDS=180`
- `SYSTEM_UPDATE_ALLOW_MANUAL_ROLLBACK=true`

## Permissões

- `systemUpdate.read`
- `systemUpdate.verify`
- `systemUpdate.execute`
- `systemUpdate.rollback`
- `systemUpdate.history`

Admin recebe tudo por padrão.

## Healthchecks

- API: `GET /api/healthz`
- Frontend: `GET /`

## Testes

- `cd workspace && pnpm run typecheck`
- `cd workspace && pnpm run build`
- `node tools/system-update-selftest.mjs`

## Limitações

- Update segue branch remota configurada.
- Changelog vem de `git log`, não de release notes do GitHub.
- Backup de banco depende de `pg_dump`/`pg_restore` no runtime.
- UI usa SSE para progresso e polling periódico como fallback quando a conexão cai.
