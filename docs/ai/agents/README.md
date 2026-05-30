# Agentes especializados

Personas para delegar tarefas a agentes IA. Copie o conteúdo como system prompt ou referência.

| Agente | Arquivo | Domínio |
|--------|---------|---------|
| L2 Circuits | [l2-specialist.md](./l2-specialist.md) | Parsers, refresh, VSI, NOC L2 |
| BGP & SNMP | [bgp-snmp-specialist.md](./bgp-snmp-specialist.md) | SNMP_FAST, drilldown, VRP |
| Connectors | [connectors-specialist.md](./connectors-specialist.md) | WireGuard, bastion, jobs |
| Frontend NOC | [frontend-noc-specialist.md](./frontend-noc-specialist.md) | React UI, shadcn |
| QA & Smoke | [qa-smoke-specialist.md](./qa-smoke-specialist.md) | Selftests, CI, reports |

## Uso no Cursor

1. Abrir persona relevante
2. Carregar skill em `.cursor/skills/<name>/SKILL.md`
3. Rules automáticas via `.cursor/rules/*.mdc`

## Uso no Codex

- Migração legado: `.codex/skills/netops-migration/SKILL.md`
