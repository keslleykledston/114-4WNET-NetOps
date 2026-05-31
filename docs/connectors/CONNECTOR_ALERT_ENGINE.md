# Connector Alert Engine

## Funções

- `evaluateConnectorAlerts()` — todos os connectors ativos
- `evaluateConnectorAlert(connectorId)` — um connector
- `upsertAlert()` — cria ou atualiza `last_seen_at` se OPEN/ACK já existe
- `resolveAlert()` — marca RESOLVED quando a condição some

## Deduplicação

Alertas abertos são únicos por `(connector_id, alert_type, device_id)` com `status IN (OPEN, ACKNOWLEDGED)`.

## Tipos e severidade mínima

| Tipo | Condição | Severidade |
|------|----------|------------|
| CONNECTOR_OFFLINE | heartbeat > 600s | CRITICAL |
| WIREGUARD_STALE_HANDSHAKE | WG UP e handshake > 600s | WARNING |
| JOBS_QUEUE_BACKLOG | pending > 20 ou oldest pending > 10 min | WARNING |
| JOBS_FAILING | failed 1h > 5 | WARNING |
| HIGH_CPU | cpu > 90% | WARNING |
| HIGH_MEMORY | memory > 90% | WARNING |
| SSH_COLLECTION_FAILED | último SSH_CONFIG_BUNDLE FAILED (1h) | WARNING |
| SNMP_COLLECTION_FAILED | SNMP_FAST failed ou job SNMP FAILED | WARNING |
| CONFIG_PARSE_FAILED | `collected_configs.parser_status = FAILED` | WARNING |
| BGP_PARSE_FAILED | erros de parse com menção BGP | WARNING |
| L2_PARSE_FAILED | erros de parse L2/MPLS/VSI | WARNING |

## API manual

- `POST /api/connector-alerts/:id/ack` → ACKNOWLEDGED
- `POST /api/connector-alerts/:id/resolve` → RESOLVED (operador)

## Scheduler

Intervalo na API (`connector-health.runner.ts`), não no scheduler de discovery/compliance.
