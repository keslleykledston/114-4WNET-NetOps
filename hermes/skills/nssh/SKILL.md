---
name: nssh
description: "SSH read-only em device NetOps. Ex: /nssh 1 display version"
---

# NetOps SSH (Telegram)

Execute **somente** via script (read-only):

```bash
./hermes/scripts/netops-ssh.sh <device_id|hostname> "<comando>"
```

## Exemplos Telegram

| Mensagem | Ação |
|----------|------|
| `/nssh 1 display version` | Versão do device 1 |
| `/nssh 3 display interface brief` | Interfaces do device 3 |
| `/nssh router-core ping 8.8.8.8` | Ping via hostname |

## Permitido

`display`, `show`, `ping`, `traceroute` — **nunca** `configure` ou `commit`.

Skill completa: `netops-ssh`
