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
- RBAC local e auth: [docs/RBAC_MODEL.md](docs/RBAC_MODEL.md)
- Setup local de auth: [docs/AUTH_LOCAL_SETUP.md](docs/AUTH_LOCAL_SETUP.md)
- Permissões por role: [docs/USER_ROLES_PERMISSIONS.md](docs/USER_ROLES_PERMISSIONS.md)
- Scheduler local: [docs/SCHEDULER_MODEL.md](docs/SCHEDULER_MODEL.md)
- NetBox read-only sync: [docs/NETBOX_READONLY_SYNC.md](docs/NETBOX_READONLY_SYNC.md)

## Subir com Docker

```bash
cp .env.example .env
docker compose up --build -d
```

URLs:

- Frontend: `http://localhost:3000`
- API: `http://localhost:8080/api/healthz`

Login local:

- abrir `http://localhost:3000/login`
- definir `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `ADMIN_NAME` no `.env`
- `ADMIN_PASSWORD` precisa existir para criar o admin inicial
- `CONFIG_APPLY_ENABLED=false` continua bloqueando apply real
- `DRY_RUN_DEFAULT=true` continua no modo seguro
- scheduler aparece em `/scheduler`
- NetBox read-only usa `NETBOX_ENABLED`, `NETBOX_URL`, `NETBOX_TOKEN` e aparece em `/integrations`

## Parar

```bash
docker compose down
```

Para apagar banco local:

```bash
docker compose down -v
```
