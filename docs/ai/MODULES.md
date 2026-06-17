# Módulos — mapa completo

## Backend — `workspace/artifacts/api-server/src/`

### Core (`src/`)

| Path | Responsabilidade |
|------|------------------|
| `index.ts` | Bootstrap HTTP, listen |
| `app.ts` | Express app, CORS, JSON |
| `lib/env.ts` | Variáveis de ambiente |
| `lib/auth.ts` | Sessions, RBAC, bootstrap admin |
| `lib/ssh.ts` | SSH2 wrapper, command runner |
| `lib/logger.ts` | Pino |
| `lib/snmp-poller.ts` | Background poller (se habilitado) |

### Rotas top-level (`src/routes/`)

| Arquivo | Prefixo / recurso |
|---------|-------------------|
| `health.ts` | `/healthz` |
| `auth.ts` | `/auth/*` |
| `users.ts` | `/users/*` |
| `devices.ts` | `/devices/*` |
| `device_groups.ts` | `/device-groups/*` |
| `compliance.ts` | `/compliance/*` |
| `templates.ts` | `/templates/*` |
| `provisioning.ts` | `/provisioning/*` |
| `audit.ts` | `/audit/*` |
| `reports.ts` | `/reports/*` |
| `integrations.ts` | `/integrations/*` |
| `collected_configs.ts` | `/collected-configs/*` |
| `snmp_snapshots.ts` | `/snmp-snapshots/*` |

### Módulos de domínio (`src/modules/`)

#### `netops/`
- BGP peers, policies, communities, interfaces summary
- SNMP read-only collection adapters
- `device-discovery/` — snapshot discovery, community library
- `snmp/` — session, OIDs, credential resolver, collect
- `huawei-vrp/` — parsers CLI (interface, BGP, route-policy)

#### `l2circuits/`
- Discovery SSH (`L2_DISCOVER_SSH_ENABLED`)
- List/get circuits, findings
- `operational-refresh/` — SNMP + SSH ops, stale marking
- `parsers/` — `huawei-vrp-l2.ts`, `s6730-l2.parser.ts`, `dot1q-local.parser.ts`, `vsi-multipoint.helpers.ts`
- `normalizers/` — status, findings, circuit-key

#### `operational/`
- SNMP_FAST interfaces (`/operational/interfaces`)
- Pilot gate via `pilot.ts`

#### `operational-bgp/`
- SNMP_FAST BGP RFC4273 peers
- Freshness per device

#### `bgp-drilldown/`
- Snapshot cache, history, optional SSH detail

#### `connectors/`
- Tenant/connector CRUD, WG provision
- Job queue (SNMP, SSH, ping, traceroute)
- Post-SSH autocollect → config backup parse

#### `config-backup/`
- Parse bundle pós-connector

#### `compliance/`
- Policy engine, jobs, findings export

#### `provisioning/`
- Preview engine legado (v0.4), export renderer — **não reativado** como backend da UI principal

#### `config-generator/`
- Engine oficial de preview (MVP fechado): templates, validate/render, runs, diff, ID allocator, change request preview
- Gate: `CONFIG_GENERATOR_ENABLED` (default false)
- Docs: `docs/config-generator/`

#### `netbox/`
- Read-only sync

#### `scheduler/`
- Cron-like scheduled jobs

---

## Frontend — `workspace/artifacts/netops-manager/src/`

### Páginas (`pages/`)

| Arquivo | Rota |
|---------|------|
| `dashboard.tsx` | `/` |
| `devices.tsx`, `device-detail.tsx` | `/devices`, `/devices/:id` |
| `l2-circuits.tsx` | `/l2-circuits` |
| `compliance.tsx` | `/compliance` |
| `provisioning.tsx` | `/provisioning` (reexport Config Generator) |
| `config-generator.tsx` | `/config-generator` (mesma UI, rota técnica) |
| `operational-bgp.tsx` | `/operational/bgp` |
| `bgp-peer-drilldown.tsx` | `/bgp/peer-drilldown` |
| `connectors.tsx`, `connector-detail.tsx` | `/infrastructure/connectors` |
| `config-collection.tsx` | `/config-collection` |
| `scheduler.tsx`, `users.tsx`, `audit.tsx`, … | respectivas |

### Features (`features/`)

| Diretório | Uso |
|-----------|-----|
| `l2-circuits/` | API, badges, table cells, detail sheet, export |
| `device-inventory/` | Collect buttons, interfaces |
| `device-discovery/` | Discovery UI |
| `bgp/`, `bgp-drilldown/` | BGP modals, drilldown |
| `operational-bgp/` | Operational BGP state |
| `connectors/` | Connector management |
| `compliance/` | Finding groups, drawers |
| `netops-tree/` | Device tree nav |

---

## Libs compartilhadas (`workspace/lib/`)

| Pacote | Export |
|--------|--------|
| `@workspace/db` | Drizzle client, schema, tables |
| `@workspace/api-spec` | OpenAPI YAML |
| `@workspace/api-zod` | Schemas Zod |
| `@workspace/api-client-react` | Generated hooks |

---

## Infra / deploy

| Path | Módulo |
|------|--------|
| `infra/connector-agent/agent/` | Python agent (main, jobs, executor) |
| `infra/wireguard-hub/` | Hub container |
| `deploy/bastion/` | Client installer |

---

## Ferramentas (`tools/`)

62+ scripts `.mjs` — ver [TESTING.md](./TESTING.md).

---

## Documentação por domínio (humana)

| Domínio | Pasta |
|---------|-------|
| Connectors | `docs/connectors/` |
| L2 | `docs/l2-circuits/` |
| Collection/SNMP | `docs/collection/` |
| BGP | `docs/bgp/`, `docs/netops/` |
| Frontend | `docs/frontend/` |
