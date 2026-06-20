# BGP Announcement Matrix

## Visão geral

Feature NetOps para visualizar, auditar e propor mudanças controladas na matriz de anúncios BGP (communities por upstream/target). Cobre snapshot, matriz, preview read-only, change-plans, aprovação, dry-run, postcheck, rollback e histórico temporal.

## Problema resolvido

Operadores precisavam entender **o que anunciam para cada upstream** (On/P1/P2/P3/P4/Off) a partir de route-policies Huawei, sem editar configuração diretamente. A matriz consolida:

- classificação de targets (`origin_target`, `customer_import_target`);
- resolução de communities e prefixos;
- auditoria de upstreams Cxx (Local-AS, prepend);
- fluxo seguro de mudança com aprovação e dry-run.

## Fluxo principal

1. **Refresh** — gera snapshot latest da matriz.
2. **Leitura** — UI `/bgp/announcements` exibe rows/cells, auditoria e community sets.
3. **Preview** — clique em célula → escolher estado desejado → diff + commands propostos + rollback.
4. **Change-plan** — salvar draft → solicitar aprovação → aprovar/rejeitar.
5. **Dry-run** — simula execução (`would_execute`), sem SSH.
6. **Postcheck** — refresh observado + comparação expected vs observed.
7. **Rollback** — request → approve → dry-run → postcheck (real bloqueado por default).
8. **Histórico** — timelapse de mudanças entre snapshots.

## Status da feature

| Fase | Escopo | Status |
|------|--------|--------|
| PR Foundation | snapshots, refresh, UI base | Entregue |
| PR2 | target classification | Entregue |
| PR3 | community resolver, prefix expansion | Entregue |
| PR4 | community sets, upstream audit | Entregue |
| PR5 | preview, change-plans | Entregue |
| PR6 | approval, dry-run | Entregue |
| PR7 | locks, postcheck, execution guard | Entregue |
| PR8 | rollback, timelapse, diff | Entregue |
| PR9 | hardening, homologação, docs | Entregue |

**Execução real e rollback real permanecem bloqueados por default.** Homologação operacional segura; execução real somente em lab controlado.

## Documentação

| Doc | Conteúdo |
|-----|----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Módulos, tabelas, fluxos técnicos |
| [OPERATIONS.md](./OPERATIONS.md) | Uso diário no NOC |
| [SAFETY_MODEL.md](./SAFETY_MODEL.md) | Travas e gates |
| [FEATURE_FLAGS.md](./FEATURE_FLAGS.md) | Flags e defaults |
| [API.md](./API.md) | Endpoints REST |
| [HOMOLOGATION_CHECKLIST.md](./HOMOLOGATION_CHECKLIST.md) | Checklist manual |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Problemas comuns |

## Testes

```bash
node tools/bgp-announcement-full-suite.mjs
node tools/bgp-announcement-e2e-flow-selftest.mjs
```

## Relatórios de fase

Ver `reports/bgp-announcements/BGP_ANNOUNCEMENT_*_REPORT.md`.
