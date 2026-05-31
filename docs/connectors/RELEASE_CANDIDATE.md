# Connectors Release Candidate

Esta é a base de liberação da Fase 8 para o módulo Connectors / Bastião.

## Escopo consolidado

- Fase 1: base do bastião e connector agent
- Fase 2: execução read-only
- Fase 4: job queue e execução operacional
- Fase C-G: parsers, coleta, BGP/L2, discovery e persistência
- Fase 5: health dashboard e alert engine
- Fase 5.2: Credential Vault
- Fase 5.3: Config History e Diff
- Fase 6.0: NETCONF via Connector
- Fase 6.1: Provisioning preview via Connector
- Fase 7.0: Connector HA
- Fase 7.1: Notifications
- Fase 8: hardening, E2E real e release candidate

## Critérios de corte

- migrations SQL aplicadas automaticamente no startup
- smoke único validando o stack local
- teste de segredos sem vazamento em respostas administrativas
- checklist E2E real documentado para um device de laboratório
- api e web saudáveis no compose

## Observações

- A tabela de controle de migrations é `schema_migrations`.
- O endpoint administrativo de WireGuard entrega apenas o preview da configuração, sem chave privada.
- As respostas administrativas devem mascarar segredos operacionais; o smoke e o leak test cobrem `connector`, `device`, `credential vault`, `notifications`, `provisioning` e `export`.
