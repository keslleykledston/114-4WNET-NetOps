# Workflow: Deploy containers

**Agent:** any (infra step)

## Steps

1. Identify changed layer: `api` | `web` | `migrate` | `wg-hub`
2. Rebuild only what changed:
   ```bash
   docker compose build api web
   docker compose up -d api web
   ```
   Or: `tools/apply-containers.sh api web`
3. Wait health:
   ```bash
   curl -sS http://127.0.0.1:8080/api/healthz
   ```
4. L2 ops override (lab): if file exists:
   ```bash
   docker compose -f docker-compose.yml -f .l2-ops-1c-compose.override.yml up -d api
   ```

## Do not

- `down -v`
- Rebuild all services when only `web` changed
