# API — BGP Announcement Matrix

Base: `/api/bgp/announcements` (prefixo API global do NetOps).

Permissões RBAC indicadas por endpoint.

## Matrix

### GET `/matrix/latest?deviceId={id}`

Retorna snapshot latest ou empty state.

**200 empty:** `{ empty: true, message, can_refresh }`

**200 ok:** `{ snapshot_id, generated_at, is_stale, matrix, summary, diff_summary, status }`

### POST `/matrix/refresh`

Body: `{ deviceId }`

Cria run + snapshot latest + diff + history events.

### GET `/matrix/diff?previousSnapshotId=&currentSnapshotId=`

Diff detalhado entre dois snapshots.

## History

### GET `/history?deviceId=&targetPolicyName=&upstreamCircuitId=&dateFrom=&dateTo=&eventType=&limit=`

Requer `BGP_ANNOUNCEMENT_TIMELAPSE_ENABLED=true`.

## Preview & change-plans

### POST `/preview-change`

```json
{
  "deviceId": 44,
  "baseSnapshotId": 100,
  "targetPolicyName": "ORIGIN-RP",
  "upstreamCircuitId": "10",
  "desiredState": "P2",
  "note": "optional"
}
```

**Erros comuns:** `SNAPSHOT_NOT_LATEST`, `SNAPSHOT_STALE`, `TARGET_IS_EXPORT_POLICY`, `TARGET_IS_UPSTREAM_AUDIT_ONLY`, `REFRESH_IN_PROGRESS`

### POST `/change-plans`

```json
{ "previewId": "bgp-preview-v1....", "note": "draft" }
```

### GET `/change-plans?deviceId=`

### GET `/change-plans/:id`

### POST `/change-plans/:id/cancel`

## Approval

### POST `/change-plans/:id/request-approval`

### POST `/approvals/:id/approve` | `/reject`

Body opcional: `{ "reason": "..." }`

**Erros:** `CHANGE_PLAN_HAS_CRITICAL_RISK`, `CHANGE_PLAN_ROLLBACK_MISSING`, `CHANGE_PLAN_CONFLICT_ACTIVE`

## Execution

### POST `/change-plans/:id/dry-run`

Requer approval approved. Retorna execution com logs `would_execute`.

### POST `/change-plans/:id/execute`

Com flag OFF → `{ blocked: true, featureFlag: "BGP_ANNOUNCEMENT_EXECUTION_ENABLED" }`

### POST `/change-plans/:id/postcheck`

Refresh observado + comparação.

## Rollback

### POST `/change-plans/:id/rollback/request`

### GET `/rollbacks?deviceId=`

### POST `/rollbacks/:id/approve` | `/reject`

### POST `/rollbacks/:id/dry-run`

### POST `/rollbacks/:id/execute`

Com flag OFF → blocked + audit `ROLLBACK_REAL_BLOCKED`

### POST `/rollbacks/:id/postcheck`

## Community sets & upstream audit

- `GET /api/bgp/community-sets?deviceId=`
- `GET /api/bgp/upstreams/audit?deviceId=`
- `POST /api/bgp/community-sets/find-exact-match`
- `POST /api/bgp/upstreams/audit/run`

## Códigos HTTP resumidos

| Código | Significado |
|--------|-------------|
| 400 | Payload inválido |
| 403 | RBAC |
| 404 | Device/snapshot/plan não encontrado |
| 409 | Gate bloqueado (stale, conflito, status) |
| 503 | Feature flag OFF (`MATRIX_DISABLED`, `PREVIEW_DISABLED`, `DRY_RUN_DISABLED`) |
