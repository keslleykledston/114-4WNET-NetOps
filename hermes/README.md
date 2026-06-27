# Hermes Agent — Orquestrador NetOps Multi-Agente

Integração do [Hermes Agent](https://hermes-agent.nousresearch.com/) (Nous Research) com a plataforma **114-4WNET NetOps**.

## Arquitetura

```
                    ┌─────────────────────────┐
                    │   Hermes Profile: netops │
                    │   SOUL.md (orquestrador) │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
     ┌────────▼────────┐ ┌──────▼──────┐ ┌───────▼───────┐
     │  netops-ssh     │ │netops-queries│ │ netops-tests  │
     │  SSH Operator   │ │Query Analyst │ │  Test Runner  │
     └────────┬────────┘ └──────┬──────┘ └───────┬───────┘
              │                 │                 │
     ┌────────▼────────┐ ┌──────▼──────┐ ┌───────▼───────┐
     │ connector jobs  │ │  REST API   │ │ tools/*.mjs   │
     │ WG + bastion    │ │  + Postgres │ │ pnpm typecheck│
     └─────────────────┘ └─────────────┘ └───────────────┘
```

### Modos de operação

| Modo | Quando usar | Como |
|------|-------------|------|
| **Telegram** | Bot no celular | `/health`, `/nssh`, `/nq` — ver `TELEGRAM.md` |
| **Skill direta** | Tarefa de domínio único | `/netops-ssh`, `/netops-queries`, `/netops-tests` |
| **Bundle** | Contexto completo NetOps | `/netops` ou `/nop` |
| **Kanban Swarm** | Investigação paralela multi-domínio | `scripts/swarm-netops.sh` |

## Estrutura

```
hermes/
├── distribution.yaml      # Manifest Hermes (profile install)
├── profile.yaml           # Metadata do profile (kanban orchestrator)
├── SOUL.md                # Persona do orquestrador
├── config.yaml            # Model + working_dir
├── skills/
│   ├── netops-orchestrator/
│   ├── netops-ssh/
│   ├── netops-queries/
│   └── netops-tests/
├── skill-bundles/
│   └── netops.yaml        # /netops — carrega todas as skills
├── agents/                # Definições dos sub-agentes
├── scripts/               # Wrappers executáveis
└── .env.example
```

## Instalação

### 1. Pré-requisitos

- Hermes Agent ≥ 0.12 instalado (`~/.hermes/`)
- Plataforma NetOps rodando (`docker compose up -d`)
- Credenciais admin configuradas

### 2. Instalar profile NetOps

```bash
hermes profile install /home/suporte/projects/114-4WNET_NetOps/hermes --name netops -y
hermes profile use netops
```

### 3. Configurar ambiente

```bash
cp hermes/.env.example ~/.hermes/profiles/netops/.env
# Editar ADMIN_EMAIL, ADMIN_PASSWORD, NETOPS_API_URL
```

### 4. Tornar scripts executáveis

```bash
chmod +x hermes/scripts/*.sh
```

### 5. Verificar

```bash
hermes profile show netops
hermes skills list
hermes bundles list
```

### 6. Telegram (gateway)

```bash
chmod +x hermes/scripts/telegram-setup.sh
./hermes/scripts/telegram-setup.sh          # publica no gateway default
# ou
./hermes/scripts/telegram-setup.sh netops   # gateway no profile netops
```

Guia: [`TELEGRAM.md`](TELEGRAM.md)

## Uso

### Telegram

| Comando | Tipo | Exemplo |
|---------|------|---------|
| `/health` | instantâneo | status API |
| `/devices` | instantâneo | inventário |
| `/flags` | instantâneo | feature flags |
| `/nssh` | sub-agente | `/nssh 1 display version` |
| `/nq` | sub-agente | `/nq connectors` |
| `/ntest` | sub-agente | `/ntest domain l2` |
| `/nop` | orquestrador | `/nop verificar device 3` |

Também aceita português natural: "lista os devices", "ssh device 1 display version".

### Chat interativo

```bash
hermes profile use netops
hermes chat
```

No chat, use slash commands:
- `/netops` — carrega todos os especialistas
- `/netops-ssh` — modo SSH operator
- `/netops-queries` — modo consultas API
- `/netops-tests` — modo validação

### Scripts diretos (terminal)

```bash
export NETOPS_REPO_ROOT=/home/suporte/projects/114-4WNET_NetOps

# SSH read-only em device
./hermes/scripts/netops-ssh.sh 1 "display version"

# Consultas API
./hermes/scripts/netops-api-query.sh health
./hermes/scripts/netops-api-query.sh devices
./hermes/scripts/netops-api-query.sh flags

# Testes
./hermes/scripts/netops-test.sh ci
./hermes/scripts/netops-test.sh domain l2
./hermes/scripts/netops-test.sh list
```

### Kanban Swarm (multi-agente paralelo)

```bash
./hermes/scripts/swarm-netops.sh "Verificar conectividade SSH do device 3 e validar parsers L2"
```

Isso cria um grafo Kanban com 3 workers paralelos:
1. **SSH Operator** — coleta no device
2. **Query Analyst** — contexto via API
3. **Test Runner** — valida com selftests

Seguido de verifier + synthesizer no profile `netops`.

Monitorar:
```bash
hermes kanban list
hermes kanban watch
hermes kanban daemon   # executar workers
```

## Sub-agentes

| Agente | Skill | Capacidades |
|--------|-------|-------------|
| Orchestrator | `netops-orchestrator` | Roteamento, delegação, swarm |
| Diagnostics | `netops-diag` | ping, latência, jitter, traceroute |
| SSH Operator | `netops-ssh` | display/show via connector |
| Query Analyst | `netops-queries` | API REST, flags, docker status |
| Test Runner | `netops-tests` | typecheck, selftests, smokes |

Definições detalhadas: `hermes/agents/`

## Segurança

- SSH **read-only** — política espelhada do connector-agent
- **Connector-first** — devices de produção via job queue WG
- **Sem secrets** em logs ou output
- **Feature flags** respeitadas (`CONFIG_APPLY_ENABLED=false` por padrão)
- Scripts bloqueiam `configure`, `commit`, metacaracteres de shell

## Atualização do profile

Após mudanças em `hermes/`:

```bash
hermes profile install /home/suporte/projects/114-4WNET_NetOps/hermes --name netops --force -y
```

## Relação com Cursor agents

Os agentes Cursor (`.cursor/agents/`) são para desenvolvimento no IDE.  
Os agentes Hermes (`hermes/agents/`) são para **operação runtime** via CLI/gateway.

Ambos compartilham as mesmas regras de segurança (`AGENTS.md`, `docs/ai/`).

## Troubleshooting

| Problema | Solução |
|----------|---------|
| `Permission denied` em skills | `chmod` em `~/.hermes/skills/` ou reinstalar profile |
| API 401 | Verificar `ADMIN_EMAIL`/`ADMIN_PASSWORD` no `.env` do profile |
| SSH job FAILED | Verificar connector WG, comando read-only, device ID |
| Selftest 503 | Feature flag OFF — esperado em lab sem flags |
| Hermes não encontrado | `export HERMES_BIN=~/.hermes/hermes-agent/venv/bin/hermes` |
