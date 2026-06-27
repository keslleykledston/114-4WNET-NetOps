---
name: ndiag
description: "Diagnóstico rede: ping/latência/jitter. Ex: /ndiag teste ping www.google.com.br"
---

# Diagnostics (Telegram)

**Sub-agente de conectividade.** Para pedidos como:

- "teste o ping pra www.google.com.br"
- "qual a latência pro 8.8.8.8?"
- "mede jitter até o google"

Execute:

```bash
./hermes/scripts/netops-diag.sh intent "<frase exata do usuário>"
```

Ou direto:

```bash
./hermes/scripts/netops-diag.sh ping www.google.com.br
./hermes/scripts/netops-diag.sh ping 8.8.8.8 --device 3
```

Responda com latência média, min/max, jitter e perda de pacotes.

Skill completa: `netops-diag`
