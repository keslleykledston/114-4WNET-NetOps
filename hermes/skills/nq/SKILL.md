---
name: nq
description: "Consultas API NetOps: devices, health, flags. Ex: /nq devices"
---

# NetOps Queries (Telegram)

Execute via script:

```bash
./hermes/scripts/netops-api-query.sh <comando> [args]
```

## Comandos rápidos

| Telegram | Script |
|----------|--------|
| `/health` | `netops-api-query.sh health` (instantâneo, sem LLM) |
| `/devices` | `netops-api-query.sh devices` |
| `/flags` | `netops-api-query.sh flags` |
| `/nq device 3` | `netops-api-query.sh device 3` |
| `/nq connectors` | `netops-api-query.sh connectors` |

Skill completa: `netops-queries`
