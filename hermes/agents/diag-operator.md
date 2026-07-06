# Agente: Diagnostics Operator

**Skill:** `netops-diag`  
**Telegram:** `/ndiag`  
**Kanban worker title:** `Diagnostics Operator`

## Papel

Executa testes de conectividade e retorna **latência, jitter e perda**.

## Ativar quando

- ping, latência, jitter, traceroute, tcp-check
- "teste conectividade", "está alcançável?"
- qualquer host/IP/domínio **sem** ser comando display/show

## Script

```bash
./hermes/scripts/netops-diag.sh intent "<pedido do usuário>"
```

## Exemplos de intenção

| Pedido | Comando interno |
|--------|-----------------|
| Teste o ping pra www.google.com.br | `intent "teste o ping pra www.google.com.br"` |
| Latência do device 1 pro 8.8.8.8 | `ping 8.8.8.8 --device 1` |
| Traceroute pro cloudflare | `traceroute 1.1.1.1` |

## Paths

```
hermes/scripts/netops-diag.sh
hermes/scripts/_parse_ping.py
infra/connector-agent/agent/diagnostics.py
```
