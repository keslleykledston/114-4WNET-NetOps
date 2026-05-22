# MVP Container Rebuild Validation

## Causa raiz provável

- Dockerfile antigo copiava `workspace/` inteiro antes do `pnpm install`.
- `.dockerignore` era curta demais.
- `pnpm install` rodava sem `frozen-lockfile` e sem cache mount.
- Registry lento fazia retry e timeout em pacotes como `react-icons` e outros transitivos.

## Arquivos alterados

- [Dockerfile](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/Dockerfile)
- [.dockerignore](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/.dockerignore)
- [tools/apply-containers.sh](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/tools/apply-containers.sh)
- [docs/DOCKER_BUILD_STABILITY.md](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/docs/DOCKER_BUILD_STABILITY.md)
- [docs/PROJECT_STATUS.md](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/docs/PROJECT_STATUS.md)
- [docs/MVP_CLOSURE_PLAN.md](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/docs/MVP_CLOSURE_PLAN.md)
- [reports/MVP_ACCEPTANCE_VALIDATION.md](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/reports/MVP_ACCEPTANCE_VALIDATION.md)
- [CHANGELOG.md](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/CHANGELOG.md)
- [TODO.md](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/TODO.md)

## Comandos executados

- `pnpm -C workspace install --frozen-lockfile --ignore-scripts`
- `DOCKER_BUILDKIT=1 ./tools/apply-containers.sh api web`
- `curl -fsS http://127.0.0.1:8085/api/healthz`
- `curl -fsS http://127.0.0.1:8085/api/audit-logs`
- `curl -fsS http://127.0.0.1:8085/api/reports`
- `curl -fsS http://127.0.0.1:8085/api/integrations`
- `curl -fsS http://127.0.0.1:3005`
- `curl -fsS -X POST http://127.0.0.1:8085/api/provisioning-jobs/1/execute`
- `curl -fsS -X POST http://127.0.0.1:8085/api/provisioning-jobs/1/rollback`
- `pnpm -C workspace --filter @workspace/api-server typecheck`
- `pnpm -C workspace --filter @workspace/netops-manager typecheck`
- `BASE_PATH=/ PORT=5000 pnpm -C workspace run build`
- `pnpm -C workspace --filter @workspace/api-spec run codegen`
- `node tools/device-discovery-selftest.mjs`
- `node tools/bgp-peer-parser-selftest.mjs`
- `node tools/bgp-prefix-routes-selftest.mjs`

## Resultado do build

- `api` build: PASS
- `web` build: PASS
- `migrate` build: PASS
- `docker compose up -d --build api web`: PASS

## Containers após rebuild

- `netops-api`: healthy
- `netops-web`: healthy
- `netops-db`: healthy

## Smoke

- `/api/healthz`: OK
- `/api/audit-logs`: OK
- `/api/reports`: OK
- `/api/integrations`: OK
- front web root: OK
- `execute` com `CONFIG_APPLY_ENABLED=false`: bloqueado
- `rollback` com `CONFIG_APPLY_ENABLED=false`: bloqueado

## Pendências restantes

- apply real continua bloqueado por padrão
- rollback real continua bloqueado por padrão
- NetBox segue readiness-only
- scheduler e RBAC completos fora do MVP

## Recomendação

- Demo interna: **liberada**
- Motivo: rebuild estável, containers healthy, smoke ok, segurança mantida
