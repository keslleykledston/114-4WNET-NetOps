# API Contract

## Endpoints

- `GET /api/l2/vsi-vpls`
- `GET /api/l2/vsi-vpls/:id`
- `GET /api/l2/vsi-vpls/:id/members`
- `GET /api/l2/vsi-vpls/:id/configs`
- `GET /api/l2/vsi-vpls/:id/alarms`
- `GET /api/l2/vsi-vpls/:id/history`
- `POST /api/l2/vsi-vpls/discovery/run`

## Filtros da lista

- `tenant_id`
- `vs_id`
- `name`
- `site_id`
- `device_id`
- `status`
- `has_alarm`
- `has_divergence`
- `last_collected_from`
- `last_collected_to`
- `page`
- `page_size`

## Resposta da lista

- `id`
- `tenant_id`
- `tenant_name`
- `vs_id`
- `name`
- `status`
- `severity`
- `sites_count`
- `devices_count`
- `acs_count`
- `pws_count`
- `pws_up_count`
- `alarms_count`
- `has_divergence`
- `last_collected_at`

## Resposta do detalhe

- `service`
- `members`
- `acs`
- `pseudowires`
- `configs_metadata`
- `alarms`
- `history_summary`
- `diagnosis`
