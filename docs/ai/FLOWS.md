# Fluxos principais

## 1. Autenticação e RBAC

```mermaid
sequenceDiagram
  participant U as Browser
  participant API as api-server
  participant DB as PostgreSQL

  U->>API: POST /api/auth/login
  API->>DB: validate user + session
  API-->>U: Set-Cookie session
  U->>API: GET /api/* (cookie)
  API->>API: authorizeRequest + permissions
  API-->>U: JSON
```

- Permissões: `docs/RBAC_MODEL.md`
- Bootstrap admin: env `ADMIN_*` no primeiro start

---

## 2. L2 Circuits — discovery

**Gate:** `L2_DISCOVER_SSH_ENABLED=true`

```mermaid
flowchart LR
  A[POST /l2-circuits/discover] --> B[startL2DiscoveryJob]
  B --> C[SSH collect commands]
  C --> D[parseHuaweiL2Circuits]
  D --> E[normalizeCircuits]
  E --> F[enrichCircuitsWithFindings]
  F --> G[INSERT l2_circuits]
```

**Comandos SSH típicos:** `display mpls l2vc`, `display vsi verbose`, `display current-configuration interface`

**Parser chain:** NE8000 dot-blocks + S6730 dialect + dot1q local

---

## 3. L2 Circuits — refresh operacional

**Gate:** `L2_OPERATIONAL_REFRESH_ENABLED=true` + pilot device

```mermaid
flowchart LR
  A[POST /l2-circuits/refresh] --> B[SNMP IF-MIB]
  B --> C[SSH ops read-only]
  C --> D[merge live ops]
  D --> E[mark OPERATIONAL_STALE]
  E --> F[UPDATE rows + findings]
  F --> G[l2_device_operational]
```

- **Não insere** novos circuitos — só UPDATE
- Findings persistidos; GET respeita refresh timestamp
- Prune inventário: requer novo discovery

---

## 4. SNMP_FAST interfaces

**Gate:** `NETOPS_SNMP_REAL_ENABLED` + pilot

```
POST /api/operational/interfaces/collect { device_id }
  → collectSnmpInterfacesOnly
  → UPSERT operational_interfaces
GET /api/operational/interfaces?device_id=
```

---

## 5. SNMP_FAST BGP

**Gate:** `NETOPS_SNMP_BGP_REAL_ENABLED` + pilot

```
POST /api/operational/bgp/collect { device_id }
  → RFC4273 walk
  → UPSERT operational_bgp_peers
GET /api/operational/bgp?device_id=
```

---

## 6. BGP peer drilldown

```
GET /api/bgp/peers/:deviceId/:peer/drilldown
  → snapshot cache (TTL env)
  → optional SSH detail if BGP_DRILLDOWN_SSH_DETAIL_ENABLED
```

Frontend: `features/bgp-drilldown/`, página `/bgp/peer-drilldown`

---

## 7. Connectors (produção cliente)

```mermaid
sequenceDiagram
  participant UI as netops-manager
  participant API as api-server
  participant DB as PostgreSQL
  participant AG as connector-agent
  participant DEV as Device LAN

  UI->>API: Create connector + WG provision
  API->>DB: connector + WG keys
  AG->>API: heartbeat + poll job
  API->>DB: enqueue connector_job
  AG->>DEV: SSH/SNMP (LAN)
  AG->>API: job result
  API->>API: optional autocollect → config-backup parse
```

**Regra:** API não SSH direto em devices cliente — só via agent.

Lab local pode usar SSH direto em `devices` table.

---

## 8. Compliance

```
POST /api/compliance/jobs → engine → compliance_findings
GET  /api/compliance/findings (filters, export)
```

Engine v2: `docs/COMPLIANCE_ENGINE_V2.md`

---

## 9. Provisioning preview

```
POST /api/provisioning/preview → preview engine (dry-run)
Apply real blocked unless CONFIG_APPLY_ENABLED=true
```

---

## 10. Frontend data flow (padrão)

```
Page → useQuery (api-client-react) → nginx /api → Express → Drizzle → PG
```

Exceção L2: `features/l2-circuits/l2-circuits-api.ts` (fetch manual + React Query)

---

## 11. Docker startup

```
db (healthy) → migrate (drizzle push) → api + web (+ wg-hub)
```

Nginx `web` proxy `/api/` → `http://api:8080`
