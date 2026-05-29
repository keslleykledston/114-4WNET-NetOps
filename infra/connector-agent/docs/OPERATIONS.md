# Operações — Connector Agent

## Comandos úteis

```bash
docker compose ps
docker logs -f netops-connector-agent
docker compose restart
docker compose down
```

## Arquivos

| Path | Uso |
|------|-----|
| `/var/log/netops-connector/agent.log` | Log principal (volume `./logs`) |
| `/var/run/netops-connector/last_heartbeat` | Timestamp último heartbeat (healthcheck) |
| `/etc/netops-connector/wireguard/netops.conf` | Config WG (volume `./config`) |

## Intervalos (`.env`)

| Variável | Default | Descrição |
|----------|---------|-----------|
| `HEARTBEAT_INTERVAL` | 60s | Envio heartbeat |
| `JOB_POLL_INTERVAL` | 10s | Poll jobs pendentes |
| `JOB_TIMEOUT` | 60s | Timeout execução local |

## Tipos de job suportados

`PING`, `TRACEROUTE`, `TCP_CHECK`, `SNMP_GET`, `SNMP_WALK`, `SSH_COMMAND`, `ROUTE_CHECK`, `WG_STATUS`

## Atualização

```bash
git pull
docker compose build --no-cache
docker compose up -d
```

## Monitoramento

- Healthcheck Docker: `scripts/healthcheck.sh`
- NetOps marca OFFLINE se heartbeat > 2 min (servidor)
