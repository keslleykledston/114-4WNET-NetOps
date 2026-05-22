# v0.2.2 Scheduler Validation

## Checks

| Item | Status | Evidence |
|---|---|---|
| Scheduler local sobe com API | PASS | `startScheduler()` on API boot |
| Jobs agendados ficam no banco | PASS | `scheduled_jobs`, `scheduled_job_runs`, `scheduled_job_run_items` |
| Admin cria/edita/remove schedule | PASS | `/api/scheduled-jobs` CRUD guarded by admin |
| Operator executa run-now | PASS | `/api/scheduled-jobs/:id/run-now` guarded by operator/admin |
| Viewer apenas visualiza | PASS | GET-only access; write blocked |
| Discovery agendado funciona | PASS | run-now discovery path writes run/items |
| Compliance agendado funciona ou retorna warning controlado | PASS | no snapshot => controlled warning |
| Audit log registra execuções | PASS | `scheduled_job_*` events |
| Falha em um device não derruba execução inteira | PASS | per-device item isolation |
| Apply/rollback continuam fora do scheduler | PASS | scheduler uses only discovery/compliance/health |
| OpenAPI/Orval atualizado | PASS | regenerated client/types |
| Build/typecheck/selftests passam | PASS | validated locally |

## Notes

- `interval_minutes` is the live scheduler source in MVP.
- `cron_expression` is stored for future use.
- no secrets in job payloads or run payloads.

