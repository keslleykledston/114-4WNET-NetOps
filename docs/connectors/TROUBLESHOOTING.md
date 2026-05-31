# Troubleshooting

## Migrations não sobem

- Verifique `DATABASE_URL`.
- Verifique se o container `migrate` executou sem erro.
- Confirme a tabela `schema_migrations`.

## Connector offline

- Verifique heartbeat.
- Verifique WireGuard handshake.
- Verifique `connector_groups` e a seleção de connector disponível.
- Confirme se o token do connector não foi revogado.

## Notificações não saem

- Verifique `tenant_notification_settings`.
- Verifique `alert_notifications` para `FAILED` ou `RATE_LIMITED`.
- Confirme token do Telegram e chat id.
- Confirme URL do webhook.

## Secrets

- Segredo nunca deve aparecer em listagens, detalhes ou histórico.
- O endpoint de WireGuard administrativo não deve devolver chave privada.
- `snmpCommunity`, `password`, `telegram bot token` e `connector token` não devem aparecer em respostas de leitura ou export.
- Se uma exportação mostrar valores sensíveis, trate como regressão de hardening e rode `tools/secrets-leak-selftest.mjs`.

## Provisioning

- Preview é somente leitura.
- `CONFIG_APPLY_ENABLED=false` mantém apply real bloqueado.
- Em caso de conflito, revisar missing resources e warnings antes de aprovar.
