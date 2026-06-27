---
name: nop
description: "NetOps completo — SSH, consultas e testes. Ex: /nop verificar device 3"
---

# NetOps (Telegram)

Orquestrador NetOps. Roteie internamente:

| Intenção | Skill / comando |
|----------|-----------------|
| Ping / latência / jitter | `/ndiag` ou `netops-diag.sh intent "..."` |
| SSH em device | `/nssh` ou `netops-ssh.sh` |
| Listar/consultar API | `/nq` ou `/devices`, `/health` |
| Rodar testes | `/ntest` |
| Tudo junto | `/netops` (bundle) |

## Comandos instantâneos (sem LLM)

`/health` `/devices` `/flags` `/docker` — resposta direta da API/plataforma.

## Linguagem natural

Se o usuário escrever em português sem barra, interprete e execute o script adequado:

- "liste os devices" → `netops-api-query.sh devices`
- "ssh no device 1 display version" → `netops-ssh.sh 1 "display version"`
- "rode testes l2" → `netops-test.sh domain l2`

Skill completa: `netops-orchestrator`
