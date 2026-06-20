# Safety Model — BGP Announcement Matrix

## Princípio: read-only first

Toda operação default é leitura ou simulação. Nenhum comando SSH de escrita é enviado com flags padrão de homologação.

## Target classification

| Tipo | Na matriz | Preview/execute |
|------|-----------|-----------------|
| `origin_target` | Sim | Permitido |
| `customer_import_target` | Sim | Permitido |
| `customer_export` | Não | Bloqueado |
| Cxx upstream audit | Auditoria only | Bloqueado |
| internal_mesh / unknown | Não | Bloqueado |

## Upstream audit-only

Policies Cxx aparecem na aba **Auditoria Upstreams**, não como colunas editáveis da matriz.

## Protected global filters

Filtros globais protegidos não geram falso conflito na matriz; findings de info quando aplicável.

## Snapshot base

- Preview/approval exigem snapshot **latest** e **não stale** (< 24h).
- Refresh concorrente bloqueia preview e approval.

## Approval

- Obrigatório quando `BGP_ANNOUNCEMENT_REQUIRE_APPROVAL=true`.
- Risk `critical` bloqueia request e execução.
- Rollback commands obrigatórios no plan.

## Locks

- Lock operacional por `(device, targetPolicy, upstreamCircuit)`.
- Expiração e release em sucesso/falha de execução.
- Concorrência bloqueada enquanto lock ativo.

## Dry-run

- Simula commands com status `would_execute`.
- Não invoca SSH nem connector write.
- Exige approval aprovado e flag `BGP_ANNOUNCEMENT_DRY_RUN_ENABLED=true`.

## Feature flags

Camada principal de segurança. Ver [FEATURE_FLAGS.md](./FEATURE_FLAGS.md).

## Postcheck

- Obrigatório quando `BGP_ANNOUNCEMENT_REQUIRE_POSTCHECK=true`.
- Compara snapshot observado pós-mudança (ou simulada) vs expected.

## Rollback

- Fluxo paralelo com approval próprio.
- Dry-run rollback simula undo.
- Real bloqueado por default.

## Execução real bloqueada

```
BGP_ANNOUNCEMENT_EXECUTION_ENABLED=false  (default)
BGP_ANNOUNCEMENT_REAL_EXECUTION_PROVIDER=disabled
```

UI exibe badge "Execução real bloqueada" — sem botão de execute real.

## Rollback real bloqueado

```
BGP_ANNOUNCEMENT_ROLLBACK_ENABLED=false  (default)
```

## Audit logs

Eventos registrados via `logAuditEvent` — ver `reports/bgp-announcements/BGP_ANNOUNCEMENT_AUDIT_EVENTS.md`.

## Recomendação lab

Liberar execução real **somente** em lab isolado, com:

- device de teste;
- provider mock ou connector scaffold;
- janela de manutenção;
- observabilidade e rollback manual prontos.
