---
name: netops-queries
description: >-
  Consultas à API NetOps e status da plataforma. Use para inventário de devices,
  conectores, jobs, health check e estatísticas operacionais.
---

# NetOps Query Analyst

Consulta a plataforma NetOps via REST API e utilitários locais.

## Script principal

```bash
./hermes/scripts/netops-api-query.sh <comando> [args...]
```

## Comandos disponíveis

| Comando | Descrição |
|---------|-----------|
| `health` | Health check da API |
| `devices` | Lista devices (paginado) |
| `device <id>` | Detalhe de um device |
| `devices-stats` | Estatísticas de inventário |
| `connectors` | Lista conectores |
| `connector-jobs <connector_id>` | Jobs recentes do connector |
| `job <connector_id> <job_id>` | Detalhe de um job |
| `flags` | Feature flags relevantes do `.env` (sem secrets) |
| `docker-status` | Status dos containers NetOps |

## Exemplos

```bash
./hermes/scripts/netops-api-query.sh health
./hermes/scripts/netops-api-query.sh devices
./hermes/scripts/netops-api-query.sh device 3
./hermes/scripts/netops-api-query.sh connector-jobs 1
./hermes/scripts/netops-api-query.sh flags
```

## Variáveis de ambiente

```bash
export NETOPS_API_URL=http://127.0.0.1:8080   # ou 8085
export ADMIN_EMAIL=admin@example.com
export ADMIN_PASSWORD=...
```

## Endpoints API úteis

| Endpoint | Uso |
|----------|-----|
| `GET /api/health` | Saúde da API |
| `GET /api/devices` | Inventário |
| `GET /api/devices/:id` | Device individual |
| `GET /api/devices/stats` | Contagens |
| `GET /api/connectors` | Conectores WG |
| `GET /api/connectors/:id/jobs` | Fila de jobs |
| `GET /api/connectors/:id/jobs/:jobId` | Resultado de job |

Contrato completo: `workspace/lib/api-spec/openapi.yaml`

## Consulta DB direta (lab only)

Quando API não basta, usar Postgres via container:

```bash
docker exec netops-db psql -U netops -d netops -c \
  "SELECT id, hostname, ip_address, status, connector_id FROM devices LIMIT 20;"
```

**Nunca** consultar `password_encrypted` em output visível.

## Módulos relacionados

- `workspace/artifacts/api-server/src/modules/connectors/`
- `workspace/artifacts/api-server/src/modules/netops/`
- `workspace/artifacts/api-server/src/modules/l2circuits/`
- `workspace/artifacts/api-server/src/modules/operational/`
