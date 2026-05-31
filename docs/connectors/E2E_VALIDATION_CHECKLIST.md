# E2E Validation Checklist

Executar com um device real e um connector ativo do tenant.

## Checklist

- [ ] Registrar `tenant`, `connector_id`, `device_id`, hostname, IP e horário.
- [ ] Enviar heartbeat do connector e confirmar transição para `ONLINE`.
- [ ] Confirmar handshake do WireGuard no hub e na API do connector.
- [ ] Executar `ping` via connector.
- [ ] Executar teste TCP 22 via connector.
- [ ] Executar SSH `display version`.
- [ ] Enfileirar `SSH_CONFIG_BUNDLE`.
- [ ] Enfileirar `SNMP_FAST`.
- [ ] Confirmar parse L2 no `collected_configs`.
- [ ] Confirmar parse BGP no `collected_configs`.
- [ ] Confirmar que o config backup foi salvo.
- [ ] Coletar duas vezes e validar diff entre snapshots.
- [ ] Simular queda de heartbeat e confirmar alerta `CONNECTOR_OFFLINE`.
- [ ] Confirmar notificação Telegram.
- [ ] Confirmar notificação webhook.

## Resultado esperado

- O connector volta para `ONLINE` após heartbeat.
- O handshake do WireGuard aparece com idade consistente.
- O ping, TCP 22 e SSH retornam sucesso sem aplicar configuração.
- A coleta de configuração grava histórico e diff.
- Falha de heartbeat gera alerta e notificação.
- O preview e a coleta não retornam segredos operacionais.

## Evidência

- Registrar hostname/IP do device, connector ID, tenant e horário do teste.
- Anexar prints da UI e saída do job quando possível.
- Salvar o diff entre as duas coletas e o payload da notificação enviada.
