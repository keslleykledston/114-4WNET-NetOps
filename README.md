# NetOps Manager

Monorepo fica em `workspace/`. Raiz agora guarda bootstrap e operação local com Docker.

## Estrutura

- `workspace/` — código-fonte app, API, libs e schema Drizzle
- `infra/` — arquivos de infraestrutura do repositório
- `docs/` — documentação funcional e status do projeto
- `docker-compose.yml` — sobe PostgreSQL, migração, API e frontend
- `Dockerfile` — build multi-stage para API e frontend
- `infra/nginx/default.conf` — reverse proxy do frontend para `/api`
- `.env.example` — variáveis base

## Documentação

- Status funcional e pendências: [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md)
- Plano de fechamento do MVP: [docs/MVP_CLOSURE_PLAN.md](docs/MVP_CLOSURE_PLAN.md)

## Subir com Docker

```bash
cp .env.example .env
docker compose up --build -d
```

URLs:

- Frontend: `http://localhost:3000`
- API: `http://localhost:8080/api/healthz`

## Parar

```bash
docker compose down
```

Para apagar banco local:

```bash
docker compose down -v
```
