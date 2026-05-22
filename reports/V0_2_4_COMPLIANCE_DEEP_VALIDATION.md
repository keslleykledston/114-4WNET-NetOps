# v0.2.4 Compliance Profundo - Validação

## Resumo

Implementado compliance estruturado com `source`, `confidence` e evidence sanitizada.

## Arquivos principais

- `workspace/artifacts/api-server/src/modules/compliance/*`
- `workspace/artifacts/api-server/src/routes/compliance.ts`
- `workspace/artifacts/netops-manager/src/pages/compliance.tsx`
- `workspace/lib/db/migrations/0007_compliance_enriched_findings.sql`
- `tools/compliance-deep-selftest.mjs`

## Checks implementados

| Contexto | Checks |
|---|---|
| security | telnet ausente, SSH presente, SNMP public ausente |
| ntp | NTP configurado |
| interface | description, dot1q, duplicidade |
| bgp | peer state, policies, referências, contadores |
| l3vpn | RD, RT import/export |
| l2vpn | L2VC/VSI duplicado, VC/service id |

## Segurança

- Compliance read-only.
- Sem SSH livre.
- Sem apply/rollback.
- Evidence sanitizada.
- Secrets não retornados.

## Validação

Preencher após execução final:

| Item | Status | Evidência |
|---|---|---|
| API typecheck | PASS | `pnpm -C workspace --filter @workspace/api-server typecheck` |
| Frontend typecheck | PASS | `pnpm -C workspace --filter @workspace/netops-manager typecheck` |
| Workspace build | PASS | `BASE_PATH=/ PORT=5000 pnpm -C workspace run build` |
| OpenAPI codegen | PASS | executado durante implementação |
| compliance-deep-selftest | PASS | `node tools/compliance-deep-selftest.mjs` |
| docker build | PASS | `docker compose up -d --build api web` |
| smoke compliance | PASS | device 1, job 13 |

## Smoke real device 1

Discovery:
- status: `full`
- sources: `snmp_snapshot`, `ssh_live`, `local_db`
- warnings: 75
- BGP peers: 76
- interfaces: 491
- persisted snapshot: 21

Compliance:
- job id: 13
- status: `failed`
- pass: 51
- fail: 223
- findings: 311
- findings with source: 311
- findings with confidence: 311

Exemplos:
- security fail high source=`ssh_live` confidence=`high`: Telnet aparenta estar habilitado.
- security pass info source=`ssh_live` confidence=`high`: SSH/STelnet ou coleta SSH confirmada.
- security pass info source=`ssh_live` confidence=`high`: Community SNMP public não encontrada.

## Riscos

- Parser Huawei ainda depende da qualidade do snapshot.
- Alguns campos de route-policy/community podem variar por versão VRP.
- Sem snapshot gera `unknown`/`warning`, não comprova conformidade.
