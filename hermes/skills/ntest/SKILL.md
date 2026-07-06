---
name: ntest
description: "Testes NetOps: CI, selftests. Ex: /ntest ci ou /ntest domain l2"
---

# NetOps Tests (Telegram)

Execute via script:

```bash
./hermes/scripts/netops-test.sh <comando> [args]
```

## Exemplos Telegram

| Mensagem | Ação |
|----------|------|
| `/ntest ci` | typecheck + build |
| `/ntest domain l2` | Selftests L2 |
| `/ntest domain bgp` | Selftests BGP |
| `/ntest list` | Lista scripts disponíveis |

Skill completa: `netops-tests`
