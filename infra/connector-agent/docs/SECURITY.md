# Segurança — Connector Agent

## Princípios

- **Read-only** na fase atual — sem write em equipamentos
- **Secrets** nunca em logs (token, password SSH, SNMP community)
- **SSH** validado por prefixo permitido + lista de bloqueio + sem metacaracteres de shell
- **NetOps Server** nunca acessa equipamentos diretamente

## SSH — permitido

- `display …`
- `show …`
- `ping …` / `traceroute …` / `tracert …`
- `screen-length 0 temporary`
- `terminal length 0`

## SSH — bloqueado

`system-view`, `configure`, `commit`, `save`, `delete`, `reload`, `reboot`, `shutdown`, `undo`, `copy`, `write`, etc.

Metacaracteres bloqueados: `;` `&&` `||` `` ` `` `$()` `>` `<` `|`

## Privilégios do container

- `network_mode: host` — usar interfaces/routing do host para alcançar LAN
- `NET_ADMIN` + `privileged` — necessário para WireGuard e `ip route`
- Justificativa: o agent é um **bastião** no host do cliente; isolamento de rede bridge impediria acesso à LAN real

## Rotação de token

Revogar connector no NetOps → gerar novo → atualizar `.env` → restart container.
