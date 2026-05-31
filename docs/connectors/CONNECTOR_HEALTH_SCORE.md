# Connector Health Score

## Função

`calculateConnectorHealth(connectorId)` agrega sinais operacionais e retorna:

```json
{
  "status": "HEALTHY | WARNING | CRITICAL | OFFLINE",
  "score": 100,
  "reasons": [],
  "lastHeartbeatAgeSeconds": 120,
  "lastHandshakeAgeSeconds": 80,
  "jobsFailedLastHour": 2,
  "jobsPending": 3,
  "cpuUsage": 30,
  "memoryUsage": 45
}
```

## Sinais

| Sinal | Fonte |
|-------|--------|
| Heartbeat age | `connectors.last_heartbeat` |
| WG handshake age | último job `WG_STATUS` (`result_json.latest_handshake_*`) ou idade do job |
| Jobs failed 1h | `connector_jobs` com `status=FAILED` |
| Jobs pending | `connector_jobs` com `status=PENDING` |
| CPU/RAM | último registro em `connector_heartbeats` |

## Regras de status (pior caso vence)

| Status | Condições principais |
|--------|----------------------|
| **OFFLINE** | heartbeat > 600s ou ausente |
| **CRITICAL** | heartbeat > 300s; WG UP e handshake > 600s; fila > 20 ou pending mais antigo > 10 min; CPU/RAM > 90%; falhas 1h > 5 |
| **WARNING** | heartbeat 120–300s; WG handshake 180–600s; falhas 1h > 0 |
| **HEALTHY** | demais casos |

## Score

| Status | Score |
|--------|-------|
| HEALTHY | 100 |
| WARNING | 70 |
| CRITICAL | 40 |
| OFFLINE | 0 |

## API

- `GET /api/connectors/:id/health`
- `GET /api/connectors/health/summary`
