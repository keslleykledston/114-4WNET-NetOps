# Data Model

## Diretriz

Adotar schema novo para biblioteca consolidada, mas reaproveitar `discovery_snapshots` e `collected_configs` quando a evidencia ja existir nesses fluxos.

## Decisao inicial

- Reutilizar `discovery_snapshots` para evidencias de descoberta quando a coleta vier do pipeline existente.
- Reutilizar `collected_configs` para config bruta sempre que a origem ja existir nesse fluxo.
- Criar tabelas VSI/VPLS proprias para consolidacao, membros, configs indexadas, status history e events.
- Nao duplicar historia de coleta se um registro append-only equivalente ja existir no dominio atual.

## Tabelas candidatas

- `vsi_services`
- `vsi_service_members`
- `vsi_service_configs`
- `vsi_service_status_history`
- `vsi_service_events`

## Estado implementado

- `vsi_services`: resumo consolidado por `tenant_id + vs_id` ou fallback por nome normalizado.
- `vsi_service_members`: evidencia por dispositivo/membro.
- `vsi_service_configs`: config coletada por dispositivo com ponte para o membro.
- `vsi_service_status_history`: snapshots append-only de status e severidade.
- `vsi_service_events`: eventos e alarmes observados na consolidacao.

## Chaves logicas

- Consolidacao principal: `tenant_id + vs_id`
- Fallback quando `vs_id` ausente: `tenant_id + normalized_name`

## Campos de consolidacao

- `status`
- `severity`
- `sites_count`
- `devices_count`
- `acs_count`
- `pws_count`
- `pws_up_count`
- `alarms_count`
- `has_divergence`
- `first_seen_at`
- `last_seen_at`
- `last_collected_at`

## Decisoes

- Historico deve ser append-only.
- `config_text` precisa manter evidencia bruta com redaction.
- Eventos precisam guardar `old_value` e `new_value` quando aplicavel.
