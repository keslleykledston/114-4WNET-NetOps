# net-loom-visual → NetOps MAPA

## Stack (vendor)

| Item | Valor |
|------|-------|
| UI | React 19, Vite 8, Tailwind 4, shadcn |
| Grafo | **reactflow** ^11.11.4 |
| Router origem | TanStack Start (não portar) |
| Service | `topologyService` mock → substituir por `/api/topology/graph` |

## Contrato loom (UI)

**DeviceData** (`vendor/.../types.ts`):

- `id`, `name`, `type`, `vendor`, `role`, `site`, `tenant`, `status`
- `mgmtIp`, `uptime`, `interfaces`, `alarms`

**LinkData**:

- `id`, `source`, `target`, `edgeType`, `intfA`, `intfB`, `capacity`, `status`, `origin`, `confidence`

## Mapeamento NetOps → loom

| NetOps | Loom |
|--------|------|
| `devices.id` | `id: "device:{id}"` |
| `devices.hostname` | `name` |
| `devices.vendor` + `platform` | `vendor`, `type` (router/switch) |
| `devices.site` | `site` |
| `devices.role` | `role` |
| `devices.status` | `status` (UP/DOWN/PARTIAL/UNKNOWN) |
| `devices.ipAddress` | `mgmtIp` |
| SNMP interface count | `interfaces` |
| BGP peer sem device inventário | node `type: "bgp"` id `bgp:{deviceId}:{peerIp}` |
| BGP peer IP = device inventário | link `edgeType: "bgp"` device↔device |
| L2 `CONNECTED_TO` | link `edgeType: "service"` |
| L2VC metadata | `intfA`/`intfB`, `capacity` default `1G` |

## API NetOps

- `GET /api/topology/graph?scope=global|site|device&scopeId=`
- `POST /api/topology/rebuild` — alimenta `topology_nodes` / `topology_edges`
- Resposta graph: `{ devices, links, generatedAt, stats }`

## Integração NetOps

- Rota **`/map`** → [`pages/network-map.tsx`](workspace/artifacts/netops-manager/src/pages/network-map.tsx) (cópia fiel do loom)
- Componentes em `src/components/network-map/` + `src/lib/network-map/`
- **`topologyService`** inicia **vazio** — mapa manual, sem mock nem auto-geração do inventário
- Topology Intelligence (`/topology`) permanece separado (grafo analítico backend)

## Deps

Adicionar `reactflow` em `netops-manager/package.json`.
