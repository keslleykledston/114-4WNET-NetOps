# Alert Notifications

FASE 7.1 adiciona entrega de alertas críticos por tenant.

## Canais

- Telegram
- Webhook
- Email como estrutura preparada para expansão futura

## Alertas enviados

- `CONNECTOR_OFFLINE`
- `WIREGUARD_STALE_HANDSHAKE`
- `JOBS_FAILING`
- `CONFIG_PARSE_FAILED`
- `BGP_PARSE_FAILED`
- `L2_PARSE_FAILED`

## Configuração por tenant

- Telegram Bot Token
- Telegram Chat ID
- Webhook URL

O segredo do Telegram Bot Token é criptografado com `SESSION_SECRET` e nunca é retornado em API.

## Rate limit

- Um alerta idêntico por 30 minutos
- A chave de deduplicação considera tenant, connector, device, tipo e canal

## Histórico

- `alert_notifications` registra envios, falhas e bloqueios por rate limit
- O histórico é mantido mesmo quando o alerta é reenviado e deve ser navegado pela UI de Tenant Notifications
