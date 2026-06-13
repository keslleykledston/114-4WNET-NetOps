# Contexto persistente — NetOps

Snapshot para agentes. Última revisão estrutural: maio/2026.

## Identidade do produto

- **Nome:** 114-4WNET-NetOps (NetOps Manager)
- **Público:** NOC / engenharia de rede (Huawei VRP, S6730, NE8000)
- **Modo padrão:** read-only + preview; apply bloqueado

## Domínios funcionais

| Domínio | Backend | Frontend | Persistência |
|---------|---------|----------|--------------|
| Inventário | `devices`, `device_groups` | `/devices`, `/devices/:id` | `devices`, `device_groups` |
| NetOps core | `modules/netops` | device-inventory, netops-tree | várias |
| Discovery | `device-discovery` | device-discovery panel | `discovery_*` |
| L2 Circuits | `modules/l2circuits` | `/l2-circuits` | `l2_circuits`, `l2_device_operational` |
| SNMP_FAST IF | `modules/operational` | device detail | `operational_interfaces` |
| SNMP_FAST BGP | `modules/operational-bgp` | `/operational/bgp` | `operational_bgp_peers` |
| BGP drilldown | `modules/bgp-drilldown` | `/bgp/peer-drilldown` | `bgp_peer_drilldown_snapshots` |
| Compliance | `compliance` + engine | `/compliance` | `compliance_*` |
| Config Generator (preview) | `modules/config-generator` | `/provisioning`, `/config-generator` | `config_generator_*` |
| Provisioning legado | `provisioning` (preview v0.4) | — (backend não exposto na UI principal) | `provisioning_*` |
| Connectors | `modules/connectors` | `/infrastructure/connectors` | `connectors`, `connector_jobs` |
| Config backup | `config-backup` | `/config-collection` | `collected_configs` |
| Scheduler | `modules/scheduler` | `/scheduler` | `scheduled_jobs` |
| NetBox | `modules/netbox` | `/integrations` | sync externo |
| Auth/RBAC | `lib/auth.ts` | login, `/users` | `users`, `user_sessions` |

## Convenções de código

### Backend
- ESM (`.js` imports em TS compilado)
- Módulos: `*.routes.ts` → `*.controller.ts` → `*.service.ts`
- Feature gates: `*.gate.ts`, `pilot.ts` (allowlist device IDs)
- Parsers Huawei: `modules/l2circuits/parsers/`, `modules/netops/huawei-vrp/`
- Erros operacionais: classes com `statusCode` (403 pilot, 503 flag off)

### Frontend
- Páginas em `src/pages/`, lógica em `src/features/<domain>/`
- API: preferir `@workspace/api-client-react` quando gerado; L2 usa fetch custom em `features/l2-circuits/l2-circuits-api.ts`
- UI: shadcn + Tailwind; dark default
- Rotas: Wouter em `App.tsx`

### DB
- Drizzle schema em `lib/db/src/schema/*.ts`
- Migrations numeradas `0001_*.sql` … `0022_*.sql`
- Docker migrate: `drizzle-kit push` (não flyway manual no compose)

## Legado e migração

- Referência comportamental: projeto `60-bgp_manager` (Python) — **não copiar UI**
- Skill Codex: `.codex/skills/netops-migration/SKILL.md`
- Mapa features: `reports/migration/60_BGP_MANAGER_FEATURE_MAP.md`

## Ambientes lab conhecidos

- Device piloto SNMP/L2: ID `1` (4WNET-BVA-BRT-RX), ID `2` (4WNET-BVA-BRT-RA)
- Override compose L2 ops (ephemeral): `.l2-ops-1c-compose.override.yml` (se existir)
- Credenciais smoke: `ADMIN_EMAIL`, `ADMIN_PASSWORD` no `.env`

## Glossário

| Termo | Significado |
|-------|-------------|
| SNMP_FAST | Coleta SNMP read-only rápida (IF-MIB, BGP RFC4273) |
| L2 refresh operacional | Atualiza status/findings de circuitos já descobertos (não insert) |
| Pilot | Allowlist `SNMP_FAST_PILOT_DEVICE_IDS` |
| Connector | Agente Python na LAN cliente via WireGuard |
| Finding | Anomalia compliance ou operacional (code + severity) |
| VSI multipoint | VSI Huawei com vários peers/PWs — status PARTIAL se misto |
