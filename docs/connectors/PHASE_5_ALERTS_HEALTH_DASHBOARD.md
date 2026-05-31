# Fase 5 — Alertas, Health Score e Dashboard Operacional

## Escopo

Observabilidade dos Connectors/Bastiões sem alterar o fluxo de coleta:

- Health score por connector (`HEALTHY`, `WARNING`, `CRITICAL`, `OFFLINE`)
- Alertas persistidos em `connector_alerts` com upsert/resolve automático
- Avaliação periódica (default 60s via `CONNECTOR_HEALTH_EVAL_INTERVAL`)
- APIs REST e UI (`/infrastructure/connectors/dashboard`, aba Alertas)
- Expansão de `GET /api/devices/:id/collection-status`
- Métricas JSON em `GET /api/connectors/metrics` (preparado para Prometheus futuro)

## Fora de escopo

- Telegram, e-mail, webhooks externos
- Endpoint `/metrics` Prometheus
- Mudanças no agente de coleta além de consumir dados já existentes

## Componentes

| Artefato | Caminho |
|----------|---------|
| Migration | `workspace/lib/db/migrations/0023_connector_alerts.sql` |
| Health | `connector-health.service.ts` |
| Alert engine | `connector-alert-engine.service.ts` |
| Runner | `connector-health.runner.ts` |
| Selftest | `tools/connectors-phase5-alerts-selftest.mjs` |

## Env

```env
CONNECTOR_HEALTH_EVAL_INTERVAL=60
CONNECTOR_HEALTH_EVAL_ENABLED=true
```

## UI

- Dashboard: `/infrastructure/connectors/dashboard`
- Badge menu: `Conectores (N)` onde N = alertas abertos
- Detalhe do connector: aba **Alertas** com ACK / Resolver

## Validação

```bash
node tools/connectors-phase5-alerts-selftest.mjs
cd workspace && pnpm --filter @workspace/api-server run typecheck
```
