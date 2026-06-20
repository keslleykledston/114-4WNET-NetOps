# BGP Announcement Matrix — Release Notes (MVP Homologação)

## Versão

PR9 — Hardening + Homologação + Release Final (2026-06-20)

## O que foi entregue

Matriz operacional BGP end-to-end:

- Snapshots, refresh, diff, history/timelapse
- Target classification (origin + customer import)
- Community resolver e prefix expansion
- Community-set library (exact match)
- Upstream audit (Cxx Local-AS/prepend)
- Preview read-only com diff e rollback proposto
- Change-plans, approval, dry-run, postcheck
- Rollback operacional (dry-run + postcheck)
- UI `/bgp/announcements` com 5 tabs
- Full test suite (24 selftests + e2e)
- Documentação operacional completa

## Fluxos suportados

| Fluxo | Status |
|-------|--------|
| Ler matriz latest | ✅ |
| Refresh snapshot | ✅ |
| Preview mudança célula | ✅ |
| Change-plan draft → approval | ✅ |
| Dry-run (simulado) | ✅ |
| Postcheck observado | ✅ |
| Rollback dry-run + postcheck | ✅ |
| Histórico/timelapse | ✅ |
| Execução real | ⛔ bloqueada default |
| Rollback real | ⛔ bloqueado default |

## Limitações

- Execução real não validada em produção (flag OFF).
- Postcheck em homologação sem write real pode falhar se device não refletir mudança simulada.
- Provider real = `disabled`; connector scaffold para lab futuro.
- Snapshot stale após 24h bloqueia preview/approval.
- Dependência de config/discovery Huawei VRP parseada.

## Segurança (defaults)

```
BGP_ANNOUNCEMENT_EXECUTION_ENABLED=false
BGP_ANNOUNCEMENT_ROLLBACK_ENABLED=false
BGP_ANNOUNCEMENT_REAL_EXECUTION_PROVIDER=disabled
```

UI não expõe botão de execução real.

## Recomendações para lab

1. Device isolado com config representativa.
2. Manter execução/rollback real OFF até checklist manual completo.
3. Rodar `node tools/bgp-announcement-full-suite.mjs` após cada deploy.
4. Habilitar execução real apenas com: approval + dry-run + lock + postcheck + janela de manutenção + observabilidade.

## Próximos passos pós-MVP

- Provider real via connector (scaffold → pilot).
- Automação scheduled refresh (read-only).
- Integração NetBox read-only para contexto prefix.
- Métricas/alerting sobre findings críticos na matriz.
- Homologação em NE8000/S6730 lab com execução real controlada.

## Como validar

```bash
cd workspace && pnpm run typecheck
node tools/bgp-announcement-full-suite.mjs
node tools/bgp-announcement-e2e-flow-selftest.mjs
```

Documentação: `docs/bgp-announcements/README.md`

## Homologação NOC

**Status:** Aprovado com ressalvas (2026-06-20)

| Item | Detalhe |
|------|---------|
| Device | `#94 4WNET-BVA-BRT-RB` |
| Fluxo validado | Refresh → preview → draft → approval → dry-run → postcheck* → rollback dry-run → rollback postcheck |
| Export fora matriz | OK (0 rows) |
| Cxx fora como target | OK (0) |
| Exec real bloqueada | OK (`BGP_ANNOUNCEMENT_EXECUTION_ENABLED=false`) |
| Rollback real bloqueado | OK (`BGP_ANNOUNCEMENT_ROLLBACK_ENABLED=false`) |
| Dry-run sem SSH | OK (`would_execute` only) |

\* Postcheck change-plan inconclusivo sem write real — esperado em modo seguro.

### Bugs corrigidos na homologação

1. **DB schema legado** — prototype `rows_json` vs PR9 → migration `0062` + apply 0057–0061
2. **Rollback execute gate** — plan `execution_blocked` rejeitava block real → fix 1 linha

### Ressalvas

- Device 94 sem `origin_target` (só customer_import)
- Community sets / upstream audit vazios no device 94
- UI browser não navegada (validação humana pendente)
- Prints não capturados

### Evidências

- `reports/bgp-announcements/BGP_ANNOUNCEMENT_NOC_MANUAL_HOMOLOGATION_RESULT.md`
- `reports/bgp-announcements/noc-homologation-evidence.json`
- `reports/bgp-announcements/BGP_ANNOUNCEMENT_POST_HOMOLOGATION_DEPLOY_READINESS.md`

### Flags de segurança confirmadas

```
BGP_ANNOUNCEMENT_EXECUTION_ENABLED=false
BGP_ANNOUNCEMENT_ROLLBACK_ENABLED=false
BGP_ANNOUNCEMENT_REAL_EXECUTION_PROVIDER=disabled
CONFIG_APPLY_ENABLED=false
```
