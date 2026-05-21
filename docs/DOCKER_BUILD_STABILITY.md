# Docker Build Stability

## Causa raiz

O rebuild travava no `pnpm install` porque o Dockerfile copiava o workspace inteiro antes da etapa de dependências. Isso invalidava o cache a cada mudança de source e forçava novo download de centenas de tarballs no registry.

## Ajuste feito

- `COPY` de manifesto antes do source.
- `pnpm install --frozen-lockfile --ignore-scripts --offline`.
- `BuildKit` ligado no script de deploy local.
- cache mount para store do pnpm em `/pnpm/store`.
- `.dockerignore` ampliado para cortar `node_modules`, `.pnpm-store`, `dist`, `build`, `.git`, `.env`, logs e temporários.

## Rebuild local

Comando recomendado:

```bash
DOCKER_BUILDKIT=1 ./tools/apply-containers.sh api web
```

Se precisar ver a etapa exata:

```bash
DOCKER_BUILDKIT=1 docker compose build api
DOCKER_BUILDKIT=1 docker compose build web
```

## Regra

Não voltar para `COPY workspace/ ./` antes do install. Isso destrói cache e reintroduz timeout.
