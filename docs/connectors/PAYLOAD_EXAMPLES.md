# Connector API — Payload Examples

## Create connector (management)

`POST /api/connectors`

```json
{
  "tenant_id": 1,
  "name": "cliente-a-connector-01",
  "description": "Bastião SP1",
  "wireguard_ip": "10.255.0.2",
  "networks": [
    { "network_cidr": "10.10.0.0/16", "description": "LAN principal" }
  ]
}
```

Response includes **one-time** `connector_token` and `wireguard_config_preview`.

## Heartbeat (agent)

`POST /api/connectors/heartbeat`  
`Authorization: Bearer nc_…`

```json
{
  "connector_name": "cliente-a-connector-01",
  "status": "ONLINE",
  "version": "1.0.0",
  "wireguard_status": "UP",
  "lan_ip": "192.168.88.10",
  "wg_ip": "10.255.0.2",
  "routes_count": 4,
  "nat_enabled": true
}
```

## Pending jobs (agent)

`GET /api/connectors/jobs/pending`

```json
{
  "jobs": [
    {
      "id": 42,
      "job_type": "SSH_COMMAND",
      "target_ip": "10.10.10.1",
      "payload_json": { "command": "display version" },
      "timeout_seconds": 120,
      "status": "RUNNING"
    }
  ]
}
```

## Job result (agent)

`POST /api/connectors/jobs/42/result`

```json
{
  "success": true,
  "stdout": "Huawei Versatile Routing Platform...",
  "stderr": "",
  "exit_code": 0
}
```

## Diagnostic ping (management)

`POST /api/connectors/1/diagnostics/ping`

```json
{
  "target_ip": "10.10.10.1",
  "count": 4
}
```

Creates a `PENDING` job for the connector agent to execute locally.
