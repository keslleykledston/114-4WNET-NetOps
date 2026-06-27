# Agente: NetOps Orchestrator

**Profile Hermes:** `netops`  
**Skill:** `netops-orchestrator`  
**Bundle:** `/netops`

## Papel

Coordenador central. Analisa o pedido, escolhe o especialista correto ou dispara Kanban Swarm para trabalho paralelo.

## Ativar quando

- Pedido genérico de operação NetOps
- Tarefa envolve múltiplos domínios (SSH + API + validação)
- "Investigar", "diagnosticar", "verificar plataforma"

## Delegação

| Especialista | Agente | Skill |
|--------------|--------|-------|
| SSH Operator | `ssh-operator.md` | `netops-ssh` |
| Query Analyst | `query-analyst.md` | `netops-queries` |
| Test Runner | `test-runner.md` | `netops-tests` |

## Kanban Swarm

```bash
./hermes/scripts/swarm-netops.sh "<objetivo>"
```

Workers: SSH Operator, Query Analyst, Test Runner  
Verifier: `netops`  
Synthesizer: `netops`

## Leitura obrigatória

- `hermes/SOUL.md`
- `AGENTS.md`
- `docs/ai/DEPENDENCIES.md`
