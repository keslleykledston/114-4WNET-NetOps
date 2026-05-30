# Device access modes

## Direct (legacy)

- `devices.connector_id` is null
- NetOps Server opens SSH/SNMP to `devices.ip_address`
- Still supported for lab / migration

## Via connector (recommended)

- `devices.connector_id` references `connectors.id`
- All diagnostics and integrated collectors use connector jobs
- UI badge: **Acesso: Via &lt;connector-name&gt;**

## UI

- Device form: **Connector / Bastião** selector
- Device detail: access badge + **Executar ping / TCP / SNMP / SSH**
- Connector detail → Jobs: device, duration, masked payload, result viewer
