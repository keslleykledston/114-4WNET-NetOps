# 114-4WNET-NetOps — Agent Context

Contexto persistente para agentes de IA (Cursor, Codex, PI). **Não altere código de produção** salvo pedido explícito.

**Cursor (roteamento):** [`.cursor/README.md`](.cursor/README.md) — agents, skills, workflows (preferir sobre busca global)

Documentação de referência: [`docs/ai/README.md`](docs/ai/README.md)

## Objetivo

Plataforma NetOps para inventário, compliance, coleta read-only (SNMP/SSH), circuitos L2, BGP operacional, conectores WireGuard/bastion e preview de provisionamento — com travas de segurança (sem apply real por padrão).

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 19, Vite 7, Wouter, shadcn/ui, Tailwind 4, TanStack Query |
| API | Express 5, TypeScript ESM, esbuild |
| DB | PostgreSQL 16, Drizzle ORM |
| Rede | `ssh2`, `net-snmp` |
| Contrato | OpenAPI → Orval → `@workspace/api-client-react` |
| Runtime | Docker Compose (db, migrate, api, web, wg-hub) |

## Estrutura do repositório

```
114-4WNET_NetOps/
├── workspace/          # Monorepo pnpm (código app)
├── infra/              # nginx, wireguard-hub, connector-agent Python
├── deploy/bastion/     # Instalação cliente bastion
├── docs/               # Docs funcionais + docs/ai/ (este pacote IA)
├── reports/            # Evidências de fases e smokes
├── tools/              # Selftests e smokes (*.mjs)
├── .cursor/            # Rules + skills Cursor (projeto)
├── .codex/skills/      # Skills Codex (migração)
└── docker-compose.yml
```

## Comandos úteis

```bash
# Typecheck + build (workspace/)
cd workspace && pnpm run typecheck && pnpm run build

# Docker local
cp .env.example .env
docker compose up --build -d

# Rebuild só api/web
tools/apply-containers.sh api web

# Selftests (exemplos)
node tools/l2-circuit-huawei-vsi-selftest.mjs
node tools/l2-s6730-parser-selftest.mjs
node tools/connectors-selftest.mjs
```

Portas típicas lab: API `8080` ou `8085`, Web `3000` ou `3005`, Postgres `5432` ou `5435`.

## Arquivos críticos

| Área | Caminho |
|------|---------|
| API entry | `workspace/artifacts/api-server/src/index.ts` |
| Rotas | `workspace/artifacts/api-server/src/routes/index.ts` |
| Frontend app | `workspace/artifacts/netops-manager/src/App.tsx` |
| Schema DB | `workspace/lib/db/src/schema/` |
| Migrations | `workspace/lib/db/migrations/` |
| OpenAPI | `workspace/lib/api-spec/openapi.yaml` |
| Env flags | `workspace/artifacts/api-server/src/lib/env.ts` |
| L2 circuits | `workspace/artifacts/api-server/src/modules/l2circuits/` |
| Connectors | `workspace/artifacts/api-server/src/modules/connectors/` |

## Regras específicas (obrigatórias)

- **Não** executar ações destrutivas (`docker compose down -v`, reset DB, force push).
- **Não** alterar banco real / dispositivos sem aprovação.
- **Não** expor secrets (`.env`, chaves WG, tokens).
- **Não** habilitar write em equipamentos (`CONFIG_APPLY_ENABLED` permanece false salvo pedido).
- Preservar design shadcn/Tailwind do frontend; referência de comportamento legado: `60-bgp_manager` (read-only).
- Após mudanças de runtime: rebuild container afetado antes de declarar concluído.
- Commits/PRs: só quando o usuário pedir.

## Skills, agents e workflows (Cursor)

| Recurso | Caminho |
|---------|---------|
| **Índice roteamento** | `.cursor/README.md` |
| Agents (contexto limitado) | `.cursor/agents/*.md` |
| Skills (como implementar) | `.cursor/skills/*/SKILL.md` |
| Workflows (passos) | `.cursor/workflows/*.md` |
| Rules (globs + safety) | `.cursor/rules/*.mdc` |
| Docs referência | `docs/ai/*.md` |
| Skill migração Codex | `.codex/skills/netops-migration/SKILL.md` |

## Hermes Agent (operação runtime)

Orquestrador multi-agente para SSH, consultas API e testes via CLI Hermes:

| Recurso | Caminho |
|---------|---------|
| **Instalação e uso** | `hermes/README.md` |
| **Telegram (bot)** | `hermes/TELEGRAM.md` |
| Profile distribution | `hermes/distribution.yaml` |
| Skills (SSH, queries, tests) | `hermes/skills/*/SKILL.md` |
| Scripts operacionais | `hermes/scripts/*.sh` |
| Sub-agentes | `hermes/agents/*.md` |

## Feature flags (resumo)

| Flag | Default | Efeito |
|------|---------|--------|
| `CONFIG_APPLY_ENABLED` | false | Bloqueia apply real |
| `NETOPS_SNMP_REAL_ENABLED` | false | SNMP real |
| `SNMP_FAST_PILOT_DEVICE_IDS` | `*` | Allowlist SNMP_FAST |
| `L2_DISCOVER_SSH_ENABLED` | false | Discovery L2 SSH |
| `L2_OPERATIONAL_REFRESH_ENABLED` | false | Refresh operacional L2 |
| `NETOPS_SNMP_BGP_REAL_ENABLED` | false | BGP SNMP_FAST |
| `BGP_DRILLDOWN_SSH_DETAIL_ENABLED` | false | SSH drilldown BGP |
| `NETBOX_ENABLED` | false | Sync NetBox read-only |

Detalhes: `docs/ai/DEPENDENCIES.md` e `docs/ai/FLOWS.md`.
