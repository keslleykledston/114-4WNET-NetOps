# Documentação para IA — 114-4WNET-NetOps

Pacote de contexto para agentes. **Somente documentação** — não substitui `docs/PROJECT_STATUS.md` nem reports de fase.

## Índice

| Documento | Conteúdo |
|-----------|----------|
| [CONTEXT.md](./CONTEXT.md) | Snapshot persistente: estado, domínios, convenções |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Arquitetura em camadas, deploy, segurança |
| [MODULES.md](./MODULES.md) | Mapa de módulos backend/frontend/infra |
| [DEPENDENCIES.md](./DEPENDENCIES.md) | Pacotes pnpm, libs internas, env, integrações |
| [FLOWS.md](./FLOWS.md) | Fluxos principais (auth, L2, BGP, connectors, compliance) |
| [TESTING.md](./TESTING.md) | Selftests, smokes, CI, como validar |
| [agents/](./agents/) | Personas de agentes especializados |

## Entrada rápida para agentes

1. Ler [`../../AGENTS.md`](../../AGENTS.md) (regras e comandos).
2. Identificar domínio → abrir módulo em [MODULES.md](./MODULES.md).
3. Entender fluxo → [FLOWS.md](./FLOWS.md).
4. Validar → [TESTING.md](./TESTING.md).
5. Invocar skill em `.cursor/skills/` ou agente em `agents/` conforme tarefa.

## O que NÃO fazer (global)

- Alterar código em `workspace/artifacts/` sem tarefa explícita.
- Commit/push sem pedido.
- SNMP/SSH/discovery em massa com flags OFF.
- Writes em VRP ou apply de config real.

## Atualização

Atualizar este pacote quando:
- Novo módulo em `api-server/src/modules/`
- Nova página em `netops-manager/src/pages/`
- Nova migration em `lib/db/migrations/`
- Novo padrão de teste em `tools/`
