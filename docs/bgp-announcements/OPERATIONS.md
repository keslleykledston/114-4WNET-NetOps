# Operações — BGP Announcement Matrix

## Pré-requisitos

- Device com config coletada (discovery/announcement context).
- Permissões RBAC: `bgp_announcements.view`, `bgp_announcements.preview`, etc.
- Flags default de homologação (execução real OFF).

## Atualizar matriz

1. Abrir `/bgp/announcements`.
2. Selecionar device.
3. Clicar **Atualizar** (POST refresh).
4. Aguardar snapshot latest; verificar summary (targets, cells, findings).

**Empty state:** sem snapshot → botão "Atualizar agora".

**Stale:** badge "Snapshot stale (>24h)" → refresh antes de preview/approval.

## Ler células

- Linhas = targets (`origin_target`, `customer_import_target`).
- Colunas = upstreams (C10, C20, …).
- Labels: On, P1–P4, Off, —, ?, !
- Tooltip/prefix scope mostra expansão de prefixos quando disponível.

## Gerar preview

1. Clicar célula modificável.
2. Escolher estado desejado (ex.: On → P2).
3. Revisar diff, proposed commands, rollback, risk, findings.
4. Preview bloqueado se: snapshot não latest/stale, target export/Cxx/audit-only/unknown.

## Salvar draft

- No modal, salvar change-plan com `previewId`.
- Status inicial: `draft`.

## Aprovar

1. **Solicitar aprovação** (draft → pending).
2. Revisor: **Aprovar** ou **Rejeitar**.
3. Bloqueios: risk critical, sem rollback, conflito ativo, snapshot desatualizado.

## Dry-run

- Após `approved`, clicar **Executar dry-run**.
- Logs mostram `would_execute` — **não há SSH**.
- Badge: "Execução real bloqueada".

## Postcheck

- Após dry-run OK, **Rodar postcheck**.
- Sistema refresh observado e compara estado/community esperados.
- Resultado em `latestPostcheck` no change-plan.

## Rollback

1. Com plan em `dry_run_succeeded` ou `approved`, **Solicitar rollback**.
2. Aprovar rollback.
3. **Rollback dry-run** → **Postcheck rollback**.
4. Rollback real bloqueado por default.

## Histórico

- Tab **Histórico**: timeline ordenada, filtros por target/upstream/data.
- Diff entre snapshots via API `GET /matrix/diff`.

## O que NÃO fazer em produção (default)

- Não habilitar `BGP_ANNOUNCEMENT_EXECUTION_ENABLED`.
- Não habilitar `BGP_ANNOUNCEMENT_ROLLBACK_ENABLED`.
- Não pular approval/postcheck em ambiente real.
