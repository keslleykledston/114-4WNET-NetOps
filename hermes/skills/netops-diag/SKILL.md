---
name: netops-diag
description: >-
  Diagnóstico de rede: ping com latência/jitter, traceroute, tcp-check.
  Use para testar conectividade a hosts, IPs e destinos na internet ou via device.
---

# NetOps Diagnostics Operator

Sub-agente de **testes de conectividade** — ping, traceroute, tcp-check.

## Quando acionar

| Pedido do usuário | Ação |
|-------------------|------|
| "teste o ping pra X" | `netops-diag.sh intent "..."` |
| "latência para google" | ping + parse stats |
| "jitter para 8.8.8.8" | ping com estatísticas |
| "ping do device 3 para X" | ping via SSH no equipamento |
| "traceroute para X" | traceroute via connector |

## Script principal

```bash
./hermes/scripts/netops-diag.sh intent "<frase do usuário>"
./hermes/scripts/netops-diag.sh ping <host> [--device ID] [--count N]
./hermes/scripts/netops-diag.sh traceroute <host>
./hermes/scripts/netops-diag.sh tcp <host> [porta]
```

## Roteamento de origem

| Cenário | Origem do teste |
|---------|-----------------|
| Sem mencionar device | Connector (bastion) → fallback local |
| "device N" / "equipamento N" | SSH read-only no device (`ping -c N host`) |
| `--local` explícito | Host do gateway |

## Saída esperada (Telegram)

```
🎯 www.google.com.br
📶 latência média: 12.3 ms
   min / max: 11.1 / 14.2 ms
📊 jitter (mdev): 0.8 ms
📉 perda: 0%
📦 pacotes: 4/4
```

## Não confundir com

| Skill | Uso |
|-------|-----|
| `netops-ssh` | display/show/config em device |
| `netops-queries` | inventário API |
| `netops-tests` | selftests de código |

## Segurança

- Ping/traceroute são read-only
- Device SSH: apenas `ping -c N <host>` permitido pela política
