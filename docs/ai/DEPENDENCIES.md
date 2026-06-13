# Dependências

## Monorepo pnpm

**Root:** `workspace/package.json`  
**Workspace:** `workspace/pnpm-workspace.yaml`  
**Lock:** `workspace/pnpm-lock.yaml`  
**Catalog:** versões pinadas em `pnpm-workspace.yaml` (React 19.1, Vite 7, Drizzle, etc.)

### Pacotes internos (grafo)

```
@workspace/api-server
  ├── @workspace/db
  └── (ssh2, net-snmp, express, drizzle-orm, pino, …)

@workspace/netops-manager
  ├── @workspace/api-client-react
  └── (react, wouter, tanstack-query, radix, tailwind, …)

@workspace/api-client-react
  ├── @workspace/api-spec (openapi)
  └── @tanstack/react-query

@workspace/api-zod
  └── zod (generated)

@workspace/db
  └── drizzle-orm, postgres driver
```

### Comandos

```bash
cd workspace
pnpm install --frozen-lockfile
pnpm run typecheck    # libs + artifacts
pnpm run build        # typecheck + recursive build
```

## Dependências externas críticas

| Pacote | Uso |
|--------|-----|
| `express` ^5 | HTTP API |
| `drizzle-orm` | ORM |
| `ssh2` | SSH Huawei |
| `net-snmp` | SNMP v2c |
| `esbuild` | Bundle API |
| `vite` | Bundle frontend |
| `orval` | OpenAPI codegen |
| `@tanstack/react-query` | Data fetching SPA |

## Docker / runtime

| Imagem / serviço | Versão / nota |
|------------------|---------------|
| `postgres:16-alpine` | DB |
| `node:24-bookworm-slim` | API build/runtime |
| nginx (frontend-runtime) | Static SPA |
| `linuxserver/wireguard` ou custom | wg-hub |

## Variáveis de ambiente (matriz)

### Infra / core

| Variável | Obrigatória | Default | Consumidor |
|----------|-------------|---------|------------|
| `DATABASE_URL` | sim (api) | — | Drizzle |
| `SESSION_SECRET` | sim | — | cookies |
| `PORT` | não | 8080 | API |
| `LOG_LEVEL` | não | info | Pino |
| `ADMIN_EMAIL/PASSWORD/NAME` | bootstrap | — | auth |

### Segurança provisionamento

| Variável | Default |
|----------|---------|
| `CONFIG_APPLY_ENABLED` | false |
| `CONFIG_WRITE_ENABLED` | false |
| `CONFIG_GENERATOR_ENABLED` | false |
| `DRY_RUN_DEFAULT` | true |

Detalhes operacionais: [docs/config-generator/CONFIG_GENERATOR_MVP_CLOSURE.md](../config-generator/CONFIG_GENERATOR_MVP_CLOSURE.md)

### SNMP / operacional

| Variável | Default | Módulo |
|----------|---------|--------|
| `NETOPS_SNMP_REAL_ENABLED` | false | snmp/collect |
| `SNMP_COMMUNITY` | — | fallback lab |
| `SNMP_FAST_PILOT_DEVICE_IDS` | `*` | pilot.ts |
| `NETOPS_SNMP_BGP_REAL_ENABLED` | false | operational-bgp |
| `SNMP_POLL_ENABLED` | false | poller |

### L2

| Variável | Default |
|----------|---------|
| `L2_DISCOVER_SSH_ENABLED` | false |
| `L2_OPERATIONAL_REFRESH_ENABLED` | false |
| `L2_OPERATIONAL_REFRESH_SSH_CONFIG` | false |
| `L2_OPERATIONAL_STALE_HOURS` | 24 |

### BGP drilldown

| Variável | Default |
|----------|---------|
| `BGP_DRILLDOWN_SSH_DETAIL_ENABLED` | false |
| `BGP_DRILLDOWN_CACHE_TTL_SECONDS` | 604800 |

### NetBox

| Variável | Default |
|----------|---------|
| `NETBOX_ENABLED` | false |
| `NETBOX_URL`, `NETBOX_TOKEN` | — |

### WireGuard / connectors

| Variável | Função |
|----------|--------|
| `NETOPS_WG_SERVER_PUBLIC_KEY` | Provision client |
| `NETOPS_WG_HUB_PRIVATE_KEY` | Hub only (host) |
| `NETOPS_WG_ENDPOINT` | Client config |
| `NETOPS_WG_IP_POOL_BASE` | Connector IPs |

### Connector agent (bastion `.env`)

| Variável | Função |
|----------|--------|
| `CONNECTOR_TOKEN` | Auth agent ↔ API |
| `NETOPS_SERVER_URL` | API base |
| `WG_ENABLED` | Tunnel |

## Integrações externas

| Sistema | Modo | Path |
|---------|------|------|
| PostgreSQL | read/write app | Drizzle |
| NetBox | read-only API | `modules/netbox` |
| Huawei devices | SSH/SNMP | ssh2, net-snmp |
| GitHub Actions | CI | `.github/workflows/ci.yml` |

## Referência legado

- `60-bgp_manager` (Python) — comportamento BGP/SNMP/compliance, **fora** deste repo
