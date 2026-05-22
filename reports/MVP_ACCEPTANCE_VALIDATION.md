# MVP Acceptance Validation

| Item | Status | Evidência | Pendência |
|---|---|---|---|
| Dashboard | PASS | UI build/typecheck ok | - |
| Login / Logout | PASS | `/login` + cookie session + protected routes | - |
| RBAC local | PASS | viewer/operator/admin enforced in API | - |
| Device CRUD | PASS | API/client já existente | - |
| SSH test | PASS | `device-discovery-selftest.mjs` | - |
| SNMP fallback | PASS | discovery flow validado | - |
| Config collection | PASS | collect + discovery path ok | - |
| Upload config .txt | PASS | feature já presente | - |
| Discovery persistente | PASS | `discovery_snapshots` + smoke | - |
| BGP peers | PASS | peer parser selftest | - |
| BGP routes real-time | PASS | `bgp-prefix-routes-selftest.mjs` | - |
| Parser Huawei mínimo | PASS | verbose/policy/community/interface/l2vpn fixtures | - |
| Compliance básico | PASS | API/UI existing | - |
| Templates | PASS | API/UI existing | - |
| Provisioning L2VPN | PASS | report + preview flow | - |
| Provisioning L3VPN | PASS | preview flow | - |
| Pre-check | PASS | validate endpoint | - |
| Preview config | PASS | preview endpoint | - |
| Preview rollback | PASS | rollback blocked/safe flow | - |
| Approval | PASS | approve endpoint | - |
| Apply bloqueado | PASS | `CONFIG_APPLY_ENABLED=false` blocks execute | - |
| Rollback bloqueado | PASS | `CONFIG_APPLY_ENABLED=false` blocks rollback | - |
| Reports Markdown | PASS | `/api/reports` + download md | - |
| Audit logs | PASS | `/api/audit-logs` + export | - |
| Integrations readiness | PASS | `/api/integrations` | - |
| Scheduler | PASS | `/api/scheduled-jobs` + `/scheduler` | - |
| OpenAPI | PASS | `api-spec codegen` | - |
| Orval | PASS | regenerated | - |
| Build | PASS | `BASE_PATH=/ PORT=5000 pnpm -C workspace run build` | - |
| Typecheck | PASS | api-server + netops-manager | - |
| Containers | PASS | `docker compose up -d --build api web` rebuilt clean with BuildKit cache; api/web/db healthy | - |

## Notes

- No real apply, no real rollback.
- No secret exposure in audit/report/integration payloads.
- Route query stays SSH live; history only persists result.
- Docker build now uses manifest-first install, frozen lockfile, and pnpm store cache mount.
- Local RBAC uses httpOnly session cookie and admin bootstrap env vars.
