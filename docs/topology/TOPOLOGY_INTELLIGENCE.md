# Topology Intelligence v0.9.4

Motor de topologia para descobrir, persistir e consultar relações entre dispositivos, interfaces, circuitos, peers BGP, L2VC/VSI e serviços.

## Modelo de Dados

**Nós (Nodes):**
- DEVICE — Dispositivos de rede (routers, switches)
- INTERFACE — Interfaces de rede
- BGP_PEER — Peers BGP
- L2_CIRCUIT — Circuitos L2 (L2VC, VSI)
- VRF — Virtual Routing Forwards
- SERVICE — Serviços provisionados
- RESOURCE — Recursos alocados (VLAN, VC_ID, RD, RT)

**Arestas (Edges):**
- `HAS_INTERFACE` — Device → Interface
- `HAS_BGP_PEER` — Device → BGP Peer
- `HAS_L2_CIRCUIT` — Device → L2 Circuit
- `HAS_VSI` — Device → VSI
- `CONNECTED_TO` — L2 Circuit ↔ L2 Circuit (link remoto)
- `USES_RESOURCE` — Serviço/Circuito → Recurso
- `BELONGS_TO_VRF` — Interface → VRF
- `SERVICE_ON_DEVICE` — Serviço → Device
- `SERVICE_USES_CIRCUIT` — Serviço → L2 Circuit

**Confidence:**
- 100 = exato (p.ex. interface associada ao device)
- 90 = alta (p.ex. peer IP bate com loopback conhecido)
- 70 = médio (p.ex. VC ID bate mas peer incerto)
- 50 = baixo (p.ex. apenas descrição sugere relação)

## Construção da Topologia

### Aquisição de Dados

Usa dados existentes coletados por:
- SSH config bundles → Interfaces, VRF, VC IDs
- SNMP snapshots → Interface status, L2 info
- BGP discovery → BGP peers, AS numbers
- L2 circuits database → VC IDs, endpoints
- Service catalog → Service associations
- Resource Manager → Alocações ativas

### Regras de Construção

1. **Device → Interface**
   ```
   DEVICE HAS_INTERFACE INTERFACE (confidence: 100)
   ```

2. **Device → BGP Peer**
   ```
   DEVICE HAS_BGP_PEER BGP_PEER (confidence: 100)
   ```

3. **L2 Circuit → L2 Circuit (Link Remoto)**
   ```
   L2_CIRCUIT CONNECTED_TO L2_CIRCUIT
   ```
   Condições:
   - Mesmo VC ID
   - Remote IP matches loopback → confidence: 90
   - Apenas VC ID bate → confidence: 70

4. **Service → Device / Circuit**
   ```
   SERVICE SERVICE_ON_DEVICE DEVICE
   SERVICE SERVICE_USES_CIRCUIT L2_CIRCUIT
   ```

5. **Recurso Allocation**
   ```
   L2_CIRCUIT USES_RESOURCE RESOURCE (VC_ID)
   SERVICE USES_RESOURCE RESOURCE (VLAN, RD, RT)
   ```

## APIs

### GET /api/topology/summary

Estatísticas gerais da topologia.

**Response:**
```json
{
  "totalNodes": 150,
  "totalEdges": 300,
  "deviceCount": 25,
  "interfaceCount": 80,
  "bgpPeerCount": 30,
  "l2CircuitCount": 15
}
```

### GET /api/topology/device/:id

Topologia de um dispositivo específico.

**Response:**
```json
{
  "device": {
    "id": 123,
    "nodeType": "DEVICE",
    "label": "router1",
    "refId": 42
  },
  "neighbors": 5,
  "edges": [
    {
      "id": 1,
      "edgeType": "HAS_INTERFACE",
      "targetNodeId": 124,
      "confidence": 100
    }
  ]
}
```

### POST /api/topology/rebuild

Reconstrói topologia (global, site ou device).

**Body:**
```json
{
  "scope": "global|site|device",
  "scopeId": 123
}
```

**Response:**
```json
{
  "status": "rebuilt",
  "totalNodes": 150,
  "totalEdges": 300,
  "deviceCount": 25
}
```

### GET /api/topology/orphans

Detecta nós órfãos (sem associação).

**Response:**
```json
[
  {
    "id": 50,
    "nodeType": "L2_CIRCUIT",
    "label": "L2VC-100",
    "refId": 10,
    "reason": "No remote endpoint detected"
  }
]
```

### GET /api/topology/orphans/summary

Resumo de órfãos por tipo.

**Response:**
```json
{
  "totalOrphans": 5,
  "byType": {
    "L2_CIRCUIT": 3,
    "BGP_PEER": 2
  }
}
```

## UI

**Tabs:**
1. **Overview** — Cards com contagem de nós/arestas por tipo
2. **Devices** — Topologia de dispositivos (tabela com interfaces, peers, circuits)
3. **Orphans** — Nós órfãos com razão de isolamento

**Ações:**
- Rebuild — Reconstrói topologia completa
- Clear — Limpa topologia (admin only)

## Integração

Ao finalizar essas coleções:
- SSH config collection
- SNMP fast discovery
- L2 circuit discovery
- BGP discovery

Chamar:
```ts
buildDeviceTopology(deviceId)
```

Pipeline:
```
Device Collection → buildDeviceTopology() → Topology Updated
```

## Impact Analysis (Future)

Base para análise de impacto:
```
Se L2VC falha → quais services afetados?
L2VC → SERVICE_USES_CIRCUIT → SERVICE
SERVICE → SERVICE_ON_DEVICE → affected devices
```

---

**Status:** v0.9.4 Implementation Complete
**Typecheck:** ✓ Passing
**APIs:** 5 endpoints
**Orphan Detection:** ✓ Implemented
