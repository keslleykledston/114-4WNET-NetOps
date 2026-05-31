# Impact Analysis v0.9.5

Motor de análise de impacto que responde: "Se X falhar, o que é afetado?"

## Perguntas Respondidas

- Se device cair, quais serviços são afetados?
- Se interface cair, quais L2 circuits são afetados?
- Se L2VC/VSI cair, quais customers são afetados?
- Se peer BGP cair, quais serviços/VRFs são impactados?
- Se recurso tiver colisão, quais serviços usam?

## Modelo

**Scenarios:** Eventos de falha/risco
**Affected Items:** Componentes impactados

### Target Types
- DEVICE — Router/Switch down
- INTERFACE — Interface down
- L2_CIRCUIT — L2VC/VSI down
- BGP_PEER — BGP peer down
- SERVICE — Service failure
- RESOURCE — Resource collision/shortage

### Impact Types
- **DIRECT** — Falha imediata (interface down → circuit down)
- **INDIRECT** — Falha propagada (circuit down → service down)
- **DEPENDENCY** — Dependência (service needs resource)
- **RESOURCE_COLLISION** — Conflito de recursos
- **COMPLIANCE_RISK** — Risco de compliance

### Severity
- **CRITICAL** — Service customer impactado
- **WARNING** — Impacto indireto ou compliance risk
- **INFO** — Sem serviço associado

### Status
- **OPEN** — Cenário não resolvido
- **ACKNOWLEDGED** — Técnico reconheceu
- **RESOLVED** — Problema resolvido

## Analysis Rules

### DEVICE Impact
```
DEVICE → INTERFACE → affected
DEVICE → BGP_PEER → affected
DEVICE → L2_CIRCUIT → affected
DEVICE → SERVICE → affected
```

### INTERFACE Impact
```
INTERFACE → L2_CIRCUIT → affected
INTERFACE → SERVICE → affected
```

### L2_CIRCUIT Impact
```
L2_CIRCUIT → SERVICE → affected
L2_CIRCUIT → RESOURCE → affected
L2_CIRCUIT --[CONNECTED_TO]--> L2_CIRCUIT_remote → affected
```

### BGP_PEER Impact
```
BGP_PEER → SERVICE → affected
BGP_PEER → VRF → affected
```

### RESOURCE Impact
```
RESOURCE → ALLOCATION → affected
RESOURCE → SERVICE → affected
RESOURCE --[COLLISION]--> SERVICE → affected
```

## APIs

### GET /api/impact/summary

Estatísticas gerais de cenários.

**Response:**
```json
{
  "totalScenarios": 15,
  "openScenarios": 3,
  "criticalScenarios": 2,
  "affectedServices": 8
}
```

### POST /api/impact/analyze

Analisa impacto de falha.

**Body:**
```json
{
  "targetType": "DEVICE|INTERFACE|L2_CIRCUIT|BGP_PEER|RESOURCE",
  "targetId": 42
}
```

**Response:**
```json
{
  "id": 100,
  "targetLabel": "Device-42",
  "severity": "CRITICAL",
  "affectedItems": [
    {
      "itemType": "INTERFACE",
      "itemId": 50,
      "itemLabel": "Eth0/0",
      "impactType": "DIRECT",
      "severity": "CRITICAL"
    }
  ]
}
```

### GET /api/impact/scenarios

Lista cenários (filtrável por status).

**Query:**
```
?status=OPEN|ACKNOWLEDGED|RESOLVED
```

**Response:**
```json
[
  {
    "id": 100,
    "targetType": "DEVICE",
    "targetId": 42,
    "targetLabel": "Device-42",
    "severity": "CRITICAL",
    "status": "OPEN",
    "affectedCount": 5
  }
]
```

### GET /api/impact/scenarios/:id

Detalhes do cenário com affected items.

**Response:**
```json
{
  "id": 100,
  "targetLabel": "Device-42",
  "severity": "CRITICAL",
  "affectedItems": [...]
}
```

### POST /api/impact/scenarios/:id/ack

Reconhece cenário.

### POST /api/impact/scenarios/:id/resolve

Resolve cenário.

### GET /api/devices/:id/impact

Impact analysis para device específico.

## UI

**Tabs:**
1. **Overview** — Cards com contadores (total, open, critical, affected services)
2. **Scenarios** — Lista de cenários com status/severity/actions
3. **Service Correlation** — (Futuro) Serviços agrupados por impacto

**Scenario Card:**
- Target + label
- Severity badge
- Status (Open/Ack/Resolved)
- Affected count
- Ack/Resolve buttons

## Integration

Ao detectar:
- Device offline → `analyzeImpact(DEVICE, deviceId)`
- Interface down → `analyzeImpact(INTERFACE, interfaceId)`
- L2VC DOWN (alarm) → `analyzeImpact(L2_CIRCUIT, circuitId)`
- BGP peer down → `analyzeImpact(BGP_PEER, peerId)`
- Resource collision → `analyzeImpact(RESOURCE, resourceId)`
- Critical compliance → persist as scenario

## Example: Service Down

Cenário: L2VC falha
1. User detecta circuit down
2. POST /api/impact/analyze { targetType: "L2_CIRCUIT", targetId: 10 }
3. Sistema retorna:
   - Scenario criado (CRITICAL, OPEN)
   - Affected items: Service-X, Service-Y, Customers A+B
4. UI mostra scenario com affected services
5. Técnico clica "Ack" → status = ACKNOWLEDGED
6. Após fix, clica "Resolve" → status = RESOLVED

---

**Status:** v0.9.5 Implementation Complete
**Typecheck:** ✓ Passing
**APIs:** 7 endpoints
**Persistence:** ✓ Full scenario tracking
