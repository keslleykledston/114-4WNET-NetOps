# Safe Collection Checklist

**Use before:** enabling any new collector, scheduler job, or detail endpoint in production.  
**Default posture:** read-only, allowlisted, audited, no blind cache.

---

## 1. Pre-flight (every change)

- [ ] No `system-view` / config mode / interactive config commands
- [ ] Command validated via `validateReadonlyCommand()` (`huawei-vrp/commands.ts`)
- [ ] New commands added to `ALLOWED_COMMANDS` regex list with security review
- [ ] Blocked tokens test passes (`BLOCKED_TOKENS`: undo, reset, save, commit, reboot, format, etc.)
- [ ] Feature flag default remains **off** until pilot sign-off
- [ ] Pilot device list documented (no prod-wide blast radius)
- [ ] Timeouts set per command class (full-config &lt; 120s, detail &lt; 60s)
- [ ] Concurrent SSH sessions per device limited (e.g. max 1 full-config, 1 detail)

---

## 2. SNMP_FAST layer

- [ ] SNMP v2c **GET/WALK only** — no SET
- [ ] Community/credentials never logged or returned in API JSON
- [ ] `NETOPS_SNMP_REAL_ENABLED` or successor flag default `false` in compose
- [ ] Failed walk does not delete last good `snmp_snapshots` / `operational_*` row
- [ ] OID list documented (`docs/netops/SNMP_READONLY_COLLECTION.md`)
- [ ] IPv6 BGP gap documented — no invented peer data
- [ ] Rate limit: per-device poll interval enforced in scheduler

---

## 3. SSH_FULL_CONFIG layer

- [ ] Only full-config allowlist commands (no user-supplied free text)
- [ ] Output redacted for `password`, `snmp-agent community`, keys before persist
- [ ] `raw_config` stored with RBAC (`config.read` or stricter)
- [ ] No automatic full-config on UI page load
- [ ] Scheduler runs only in approved maintenance window (if scheduled)
- [ ] `collection_job_id` + `collected_at` written on every success
- [ ] Parse errors stored in `error_summary`; do not expose raw secrets in error
- [ ] Content hash dedup — avoid duplicate identical snapshots

---

## 4. SSH_DETAIL layer

- [ ] Triggered only by authenticated user action or approved automation
- [ ] Target parameters validated (IP, ifName, VSI name) — injection-safe
- [ ] **No bulk detail** without `collection.detail.bulk` permission + audit reason
- [ ] `received-routes` / `advertised-routes` — single peer per request
- [ ] Audit log: `detail_collection_started`, `detail_collection_completed`, device, command template, result
- [ ] Detail result TTL short; UI shows point-in-time disclaimer
- [ ] Detail does NOT update `collected_configs` or compliance catalogs
- [ ] Failed detail does not mark full-config snapshot stale

---

## 5. Data & cache safety

- [ ] `raw_config` wins over `parsed_config` in compliance path
- [ ] Empty catalog → UNKNOWN, not FAIL
- [ ] `freshness_status` computed and stored on read path minimum
- [ ] UI shows cache/stale warning when `freshness_status` ≠ `fresh`
- [ ] No compliance FAIL solely from `discovery_snapshots` without raw evidence attempt
- [ ] Additive merge preserved — omission in new collect → warning not delete

---

## 6. Compliance separation

- [ ] Operational findings tagged `plane=operational`, source `snmp` or `ssh_detail`
- [ ] Config findings tagged `plane=configurational`, source `ssh_full_config`
- [ ] Message text does not blame SNMP for missing route-policy
- [ ] Message text does not blame config parser for peer Idle (use SNMP/detail)

---

## 7. Access control

- [ ] Collection endpoints require auth + device scope permission
- [ ] Full-config collect: `device.collect` or `discovery.execute`
- [ ] Detail collect: `device.detail` or `bgp.routes.query`
- [ ] Raw config download: elevated permission + audit
- [ ] Service accounts for scheduler separated from human admin

---

## 8. Observability

- [ ] Metrics: collect duration, success/fail, bytes, command count
- [ ] Logs: no secrets; include `device_id`, `job_id`, `source`, `scope`
- [ ] Alerts: repeated SSH auth failures, allowlist rejections spike
- [ ] Dashboard: last success per layer per device

---

## 9. Rollback

- [ ] Flag off reverts to previous read path (local_db / cached snapshot)
- [ ] DB migrations for new tables reversible or nullable phase
- [ ] Parser version pin allows running compliance on old snapshots

---

## 10. Pilot exit criteria (before fleet-wide)

- [ ] 3+ pilot devices: SNMP fast + full-config + 1 detail each — no incidents
- [ ] Compliance smoke: FP=0, real errors preserved
- [ ] Security review signed on allowlist diff
- [ ] Runbook updated (`docs/NOC_OPERATIONAL_CHECKLIST.md` cross-link)

---

## Quick reference — forbidden patterns

```
system-view | configure terminal | conf t
undo | delete | reset | clear | shutdown
save | write | commit | reboot | reload
format | startup saved-configuration
snmp-agent community (write)
ip route-static (mutating)
```

Any match → **reject before SSH execute**.
