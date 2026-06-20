# Checklist de Homologação — BGP Announcement Matrix

Use este checklist manual antes de liberar uso operacional (sem execução real).

## Ambiente

- [ ] Branch/commit registrados
- [ ] `pnpm run typecheck` PASS
- [ ] `node tools/bgp-announcement-full-suite.mjs` PASS
- [ ] `node tools/bgp-announcement-e2e-flow-selftest.mjs` PASS
- [ ] Flags default seguras (execução/rollback real OFF)
- [ ] Web build OK (`PORT=3000 BASE_PATH=/ pnpm --filter @workspace/netops-manager run build`)

## A) Snapshot e matriz

- [ ] `/bgp/announcements` abre
- [ ] Empty state sem snapshot
- [ ] Refresh cria snapshot latest
- [ ] Snapshot anterior vira histórico
- [ ] Diff gerado entre snapshots
- [ ] History events gravados

## B) Target classification

- [ ] ORIGIN na matriz
- [ ] customer import na matriz
- [ ] customer export **não** na matriz
- [ ] Cxx **não** como target editável
- [ ] MALHA/internal **não** na matriz
- [ ] unknown **não** na matriz

## C) Community resolver

- [ ] direct community → cell
- [ ] community-list → cell
- [ ] Labels On/P1/P2/P3/P4/Off/—/?/! corretos
- [ ] Conflito upstream → finding + `!`
- [ ] Unknown community → `?`

## D) Prefix expansion

- [ ] ORIGIN mostra prefixScope network
- [ ] ip-prefix expande IPv4
- [ ] ipv6 prefix-list expande IPv6
- [ ] prefix-list missing → finding
- [ ] prefixScope visível na UI

## E) Community Sets

- [ ] Library listada
- [ ] Exact match funciona
- [ ] Community extra → não match
- [ ] Lista compartilhada sinalizada
- [ ] Sem edição de community-list

## F) Upstream Audit

- [ ] Cxx só na auditoria
- [ ] Local-AS/prepend audit OK
- [ ] Protected global filter = info, não erro falso
- [ ] Findings com scope/contexto

## G) Preview

- [ ] Modal abre ao clicar célula
- [ ] Preview gera diff/commands/rollback/risk
- [ ] Snapshot stale bloqueia
- [ ] export/Cxx/audit-only bloqueiam

## H) Change Plan

- [ ] Salvar draft
- [ ] Listar / detalhe / cancelar
- [ ] Solicitar aprovação

## I) Approval

- [ ] Approve / reject
- [ ] Critical bloqueia
- [ ] Sem rollback bloqueia
- [ ] Conflito ativo bloqueia

## J) Dry-run

- [ ] Approved → dry-run OK
- [ ] Logs `would_execute`
- [ ] Sem SSH
- [ ] Execução real bloqueada

## K) Postcheck

- [ ] Refresh observado
- [ ] succeeded / failed / inconclusive corretos
- [ ] UI latestPostcheck

## L) Rollback

- [ ] Request / approve / dry-run / postcheck
- [ ] Rollback real bloqueado

## M) Timelapse

- [ ] History endpoint retorna eventos
- [ ] UI timeline ordenada
- [ ] Filtros funcionam

## Segurança

- [ ] Sem botão execução real na UI (default)
- [ ] POST execute retorna blocked
- [ ] POST rollback execute retorna blocked
- [ ] Audit events registrados nos fluxos críticos

## Assinatura

| Campo | Valor |
|-------|-------|
| Data | |
| Ambiente | |
| Responsável | |
| Resultado | Aprovado / Pendências |
