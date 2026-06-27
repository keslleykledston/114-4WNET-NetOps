---
name: netops-orchestrator
description: >-
  Orquestrador NetOps multi-agente. Roteia tarefas para especialistas SSH,
  consultas API e testes. Use para operações de rede na plataforma 114-4WNET.
---

# NetOps Orchestrator

Coordena especialistas Hermes para a plataforma NetOps.

## Especialistas disponíveis

| Skill | Domínio | Quando usar |
|-------|---------|-------------|
| `netops-diag` | Ping, latência, jitter, traceroute | Testar conectividade a hosts/IPs |
| `netops-ssh` | SSH read-only via connector | Comandos `display`/`show` em equipamentos |
| `netops-queries` | API REST + status | Inventário, jobs, conectores, health |
| `netops-tests` | Selftests e smokes | Validar código, parsers, endpoints |

Carregar todos: `/netops`

## Fluxo de decisão

```
Pedido do usuário
    ├─ ping / latência / jitter / traceroute → netops-diag
    ├─ display/show em device → netops-ssh
    ├─ listar/consultar inventário, API, jobs → netops-queries
    ├─ rodar testes, validar, smoke, CI → netops-tests
    └─ tarefa complexa / múltiplos domínios → swarm-netops.sh
```

## Kanban Swarm (multi-agente paralelo)

Para investigações que exigem SSH + consultas + validação em paralelo:

```bash
./hermes/scripts/swarm-netops.sh "Descrever o objetivo aqui"
```

Workers padrão:
- **Diagnostics Operator** (`netops-diag`) — ping, latência, jitter
- **SSH Operator** (`netops-ssh`) — coleta em devices
- **Query Analyst** (`netops-queries`) — contexto via API/DB
- **Test Runner** (`netops-tests`) — valida hipóteses com selftests

## Referências no repositório

| Recurso | Caminho |
|---------|---------|
| Contexto global | `AGENTS.md` |
| Módulos API | `docs/ai/MODULES.md` |
| Feature flags | `docs/ai/DEPENDENCIES.md` |
| Agentes Cursor | `.cursor/README.md` |
| Connector agent | `infra/connector-agent/` |

## Regras

- Nunca expor secrets
- Connector-first para devices de produção
- Reportar flag OFF / 503 explicitamente
- Trabalhar a partir de `NETOPS_REPO_ROOT`
