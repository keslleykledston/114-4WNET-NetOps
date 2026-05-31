# Resource Manager v0.9.3

Gerenciamento centralizado de recursos de rede para evitar conflitos e permitir alocação automática durante provisionamento.

## Arquitetura

**Tabelas:**
- `resource_pools` — Faixas de recursos (VLAN 100-4094, VC_ID 1-65535, etc.)
- `resource_allocations` — Recursos alocados/reservados para dispositivos/serviços
- `resource_reservations` — Reservas temporárias com expiração

**Tipos de Recurso Suportados:**
- VLAN (100-4094)
- VC_ID (1-65535)
- RD (Route Distinguisher)
- RT (Route Target)
- LOOPBACK (IP addresses)
- SERVICE_ID (1-1024)

## Funções Principais

### Alocação

```ts
allocate(poolId, resourceValue?, deviceId?, serviceRequestId?)
```

Aloca recurso:
- Se `resourceValue` informado: aloca exatamente esse valor
- Se omitido: encontra próximo disponível automaticamente

Exemplo — VRF automático:
```ts
const rd = await allocate(rdPoolId); // Encontra RD disponível
```

Exemplo — VLAN específica:
```ts
const vlan = await allocate(vlanPoolId, 100, deviceId);
```

### Reserva

```ts
reserve(poolId, resourceValue, expiresAt, createdBy)
```

Reserva temporária com TTL. Previne alocação durante período de transição.

### Release

```ts
release(allocationId)
```

Libera recurso alocado, marcando como RELEASED.

### Validação

```ts
validateAvailability(poolId, resourceValue) // boolean
checkVlanConflict(vlanId) // boolean
checkVCIdConflict(vcId) // boolean
checkRDConflict(rd) // boolean
checkRTConflict(rt) // boolean
```

## APIs

### GET /api/resources/pools

Lista todas as pools (filtrável por `resourceType`).

**Response:**
```json
[
  {
    "id": 1,
    "name": "VLAN Pool DC1",
    "resourceType": "VLAN",
    "rangeStart": 100,
    "rangeEnd": 4094,
    "enabled": true
  }
]
```

### POST /api/resources/allocate

Aloca recurso em pool.

**Body:**
```json
{
  "poolId": 1,
  "resourceValue": null,
  "deviceId": 42,
  "serviceRequestId": 10
}
```

**Response:**
```json
{
  "id": 100,
  "poolId": 1,
  "value": 150
}
```

### GET /api/resources/next/:poolId

Próximo recurso disponível.

**Response:**
```json
{
  "poolId": 1,
  "next": 101,
  "available": true
}
```

### GET /api/resources/usage/:poolId

Uso da pool.

**Response:**
```json
{
  "total": 3995,
  "allocated": 123,
  "reserved": 5,
  "available": 3867
}
```

### GET /api/resources/collisions

Detecta colisões (recursos alocados duplicados).

**Response:**
```json
[
  {
    "type": "VLAN",
    "value": 100,
    "devices": ["router1", "router2"],
    "severity": "CRITICAL",
    "message": "Duplicate VLAN 100 found in 2 devices"
  }
]
```

## UI

**Tabs:**
1. **Pools** — Visualização de pools com barras de uso
2. **Allocations** — Histórico de alocações (tipo, valor, dispositivo, status, data)
3. **Reservations** — Reservas temporárias com expiração
4. **Collisions** — Conflitos detectados (tipo, valor, dispositivos, severidade)

## Integração com Service Catalog

Exemplo — VRF (RD/RT automático):
```ts
const srId = req.body.serviceRequestId;

// Resource Manager aloca automaticamente
const rd = await allocate(rdPoolId, null, null, srId);
const rtExport = await allocate(rtPoolId, null, null, srId);
const rtImport = await allocate(rtPoolId, null, null, srId);

// Template Builder usa valores alocados
const config = buildVrfConfig({
  vrfName,
  rd: rd.value,
  rtExport: rtExport.value,
  rtImport: rtImport.value,
});
```

Exemplo — L2VC (VC_ID automático):
```ts
const vcId = await allocate(vcPoolId); // Próximo VC_ID

const config = buildL2VCConfig({
  vcId: vcId.value,
  aDevice: deviceA,
  zDevice: deviceZ,
});
```

## Auditoria

Eventos registrados:
- `resource_pool_created` — Pool criada
- `resource_allocated` — Recurso alocado
- `resource_reserved` — Recurso reservado
- `resource_released` — Recurso liberado

Cada evento inclui metadata: poolId, value, deviceId, serviceRequestId.

## Cleanup

Reservas expiradas são limpas via:
```
POST /api/resources/cleanup
```

Endpoint idempotente, pode ser chamado via scheduler diariamente.

---

**Status:** v0.9.3 Implementation Complete
**Typecheck:** ✓ Passing
**API:** 12 endpoints
**UI:** 4 tabs with charts/tables
