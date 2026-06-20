# Troubleshooting — BGP Announcement Matrix

## Snapshot stale

**Sintoma:** Preview/approval retorna `SNAPSHOT_STALE` ou badge "Snapshot stale (>24h)".

**Causa:** Snapshot latest com mais de 24 horas.

**Ação:** Executar refresh na matriz. Repetir preview/approval com novo `baseSnapshotId`.

## Refresh failed

**Sintoma:** Erro na UI ou run status failed.

**Causa comum:** Device sem announcement context / discovery; refresh concorrente; config indisponível.

**Ação:** Verificar coleta do device; aguardar run anterior; checar logs do run em DB/API.

## Prefix-list missing

**Sintoma:** Finding `PREFIX_LIST_MISSING` ou prefixScope vazio.

**Causa:** if-match referencia prefix-list não encontrada no config parseado.

**Ação:** Validar config no device; corrigir inventário; tratar como finding informativo até config corrigida.

## Community conflict

**Sintoma:** Célula `!` ou finding de conflito mesmo upstream.

**Causa:** Duas regras aplicam communities conflitantes para mesmo circuit.

**Ação:** Revisar route-policy no device; não forçar preview até entender policy real.

## Local-AS unknown

**Sintoma:** Finding na auditoria upstream sobre Local-AS.

**Causa:** prepend/Local-AS diverge do esperado para Cxx.

**Ação:** Usar aba Auditoria Upstreams; validar policy Cxx; não editar via matriz (audit-only).

## Dry-run blocked

**Sintoma:** 409/503 ao executar dry-run.

**Causas:** Status ≠ approved; approval ausente; `BGP_ANNOUNCEMENT_DRY_RUN_ENABLED=false`; `EXECUTION_ENABLED=true` (scaffold inativo).

**Ação:** Aprovar plan; verificar flags; checar `buildAnnouncementDryRunGateFindings` codes.

## Postcheck failed

**Sintoma:** `POSTCHECK_FAILED` ou state/community mismatch.

**Causa:** Snapshot observado não reflete desired (mudança externa ou simulação incompleta em lab).

**Ação:** Refresh manual; comparar diff; em homologação sem execução real, postcheck pode falhar se device não mudou — esperado.

## Lock active

**Sintoma:** `EXECUTION_LOCK_ACTIVE`.

**Causa:** Outro change-plan/lock ativo para mesmo target+upstream.

**Ação:** Aguardar expiração; liberar lock após execução terminal; evitar plans paralelos no mesmo alvo.

## Rollback blocked

**Sintoma:** Rollback request/dry-run/execute bloqueado.

**Causas:** Status inválido; rollback commands vazios; flag OFF; approval pendente.

**Ação:** Verificar status plan (`dry_run_succeeded`); aprovar rollback; checar `BGP_ANNOUNCEMENT_ROLLBACK_*` flags.

## Matrix disabled (503)

**Sintoma:** `MATRIX_DISABLED` ou `PREVIEW_DISABLED`.

**Causa:** Feature flag OFF.

**Ação:** Habilitar `BGP_ANNOUNCEMENT_MATRIX_ENABLED` / `PREVIEW_ENABLED` no `.env` e rebuild API.

## Target export / Cxx no preview

**Sintoma:** `TARGET_IS_EXPORT_POLICY` ou `TARGET_IS_UPSTREAM_AUDIT_ONLY`.

**Causa:** Target não modificável by design.

**Ação:** Usar apenas origin/customer import na matriz; Cxx só via auditoria.
