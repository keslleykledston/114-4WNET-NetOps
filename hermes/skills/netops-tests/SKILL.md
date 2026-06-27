---
name: netops-tests
description: >-
  Executa validação NetOps: typecheck, build, selftests em tools/ e smokes HTTP.
  Use antes de fechar fases, após mudanças de parser/API, ou quando pedir testes.
---

# NetOps Test Runner

Validação automatizada da plataforma NetOps.

## Script principal

```bash
./hermes/scripts/netops-test.sh <comando> [args...]
```

## Comandos disponíveis

| Comando | Descrição |
|---------|-----------|
| `ci` | Paridade CI: typecheck + build |
| `selftest <script>` | Roda `tools/<script>.mjs` |
| `domain <nome>` | Selftests de um domínio |
| `list` | Lista selftests disponíveis |
| `connector` | Selftest do connector-agent Python |

### Domínios (`domain`)

| Domínio | Scripts incluídos |
|---------|-------------------|
| `l2` | parsers L2, VSI, classification |
| `bgp` | SNMP_FAST, BGP parsers, drilldown |
| `connectors` | connector logic, config bundle |
| `compliance` | compliance engine |
| `rbac` | RBAC e user management |
| `all-offline` | Todos os selftests offline (sem device real) |

## Exemplos

```bash
./hermes/scripts/netops-test.sh ci
./hermes/scripts/netops-test.sh domain l2
./hermes/scripts/netops-test.sh selftest connectors-selftest
./hermes/scripts/netops-test.sh connector
./hermes/scripts/netops-test.sh list
```

## CI parity manual

```bash
cd workspace && pnpm install --frozen-lockfile
pnpm run typecheck && pnpm run build
docker compose config && docker build -t netops-manager-ci .
```

## Smokes HTTP (requer API up)

```bash
export API_BASE=http://127.0.0.1:8080
export ADMIN_EMAIL=...
export ADMIN_PASSWORD=...
node tools/operational-pilot-smoke.mjs
node tools/connectors-selftest.mjs
```

Lista completa: `docs/ai/TESTING.md`

## Testes com device real

Requerem flags ON no `.env`:
- `L2_DISCOVER_SSH_ENABLED=true`
- `NETOPS_SNMP_REAL_ENABLED=true`
- `L2_OPERATIONAL_REFRESH_ENABLED=true`

Reportar claramente quando flag está OFF (esperado 503).

## Após mudanças de código

```bash
tools/apply-containers.sh api web
# ou
docker compose build api web && docker compose up -d api web
```

## Regras

- Não commitar a menos que o usuário peça
- Não logar secrets de `.env`
- Documentar resultados em `reports/<area>/` quando fechamento formal de fase
