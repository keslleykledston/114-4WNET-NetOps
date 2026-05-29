# PHASE H2.1B — Operational Runtime Smoke (no real SNMP)

**Date:** 2026-05-25  
**Branch:** `feature/v0.3.4-operational-pilot-noc`  
**Commit:** `ae897b4` — `feat(operational): H2.1 SNMP_FAST interfaces pilot`  
**HEAD verified:** `ae897b4886cbf1b4a35267d44af81c45e6c4df47`

---

## 1. Commit validation

```
ae897b4 feat(operational): H2.1 SNMP_FAST interfaces pilot
9f8d01d docs(collection): plan H2 SNMP fast interface collection
42c2b61 fix(compliance): prefer raw snapshot config at runtime
```

---

## 2. Migration / schema

**Method:** `docker compose run --rm migrate` → `drizzle-kit push` (non-interactive, no drop).

**SQL reference:** `workspace/lib/db/migrations/0016_operational_snmp_fast_interfaces.sql` (aligned with Drizzle schema).

**Note:** This phase uses `operational_collection_jobs`, not `collection_snapshots`.

### Tables created (verified in `netops` DB)

| Table | Status |
|-------|--------|
| `operational_collection_jobs` | EXISTS |
| `operational_interfaces` | EXISTS |
| `collection_snapshots` | N/A (not in H2.1 scope) |

Row counts after smoke (no collect executed): `operational_interfaces=0`, `operational_collection_jobs=0`.

---

## 3. API rebuild

```bash
docker compose run --rm migrate   # schema push
docker compose up -d --build api  # rebuild + restart
```

**Runtime port:** `8085` → container `8080` (`API_PORT` in compose).

For POST smoke without live SNMP, API restarted once with:

```bash
NETOPS_SNMP_REAL_ENABLED=false docker compose up -d --no-deps api
```

(.env may still list `true`; H2.1C must explicitly enable before pilot SNMP.)

---

## 4. Health

| Request | Result |
|---------|--------|
| `GET http://127.0.0.1:8085/api/healthz` | **200** `{"status":"ok"}` |

---

## 5. GET operational interfaces (no prior collect)

| Request | Result |
|---------|--------|
| `GET /api/operational/interfaces?device_id=1` | **200** |

**Body (summary):**

```json
{
  "deviceId": 1,
  "collectionJobId": null,
  "job_id": null,
  "collectedAt": null,
  "freshness": "unknown",
  "freshness_status": "unknown",
  "source": null,
  "interfaceCount": 0,
  "interfaces": []
}
```

Matches expectation: empty list, freshness **unknown**, no crash.

---

## 6. POST collect (controlled error, no SNMP)

**Precondition:** `NETOPS_SNMP_REAL_ENABLED=false` on `netops-api` container.

| Request | Result |
|---------|--------|
| `POST /api/operational/interfaces/collect` `{"device_id":1}` | **503** |
| `POST /api/operational/collection/snmp-fast` `{"deviceId":1}` | **503** (alias) |

**Body:**

```json
{
  "error": "NETOPS_SNMP_REAL_ENABLED is false — SNMP_FAST collection disabled.",
  "code": "SNMP_FAST_DISABLED"
}
```

**Device 1:** has `snmp_community` configured in DB (length 9) — live path for `SNMP_CREDENTIALS_NOT_CONFIGURED` not exercised on POST (blocked by flag first). Validated offline in `tools/snmp-fast-operational-selftest.mjs` (`credentials-error` case).

No new rows inserted in `operational_interfaces` / `operational_collection_jobs` after POST.

---

## 7. Logs / safety

| Check | Result |
|-------|--------|
| Community in API logs | **not observed** |
| Password in API logs | **not observed** |
| SSH / discovery | **not invoked** |
| SNMP IF-MIB walk / collect | **not executed** (flag off) |
| API crash | **none** |

Poller may log `SNMP poller started` at boot — background scheduler only; no H2.1 POST collect.

---

## 8. Offline selftest

```bash
pnpm dlx tsx tools/snmp-fast-operational-selftest.mjs
```

**PASS** — freshness, pilot allowlist, rate-limit, mapper fixture, `SNMP_CREDENTIALS_NOT_CONFIGURED` error class.

---

## 9. GO / NO-GO — H2.1C (pilot SNMP real)

| Criterion | H2.1B |
|-----------|-------|
| Migration 0016 / schema applied | YES |
| API up | YES |
| health OK | YES |
| GET endpoint OK | YES |
| POST controlled error (flag/credential path) | YES (503 flag; credential in selftest) |
| Logs without secret | YES |
| Zero SSH | YES |
| Zero SNMP real (this run) | YES |

**Verdict: GO** for **H2.1C** — operator may enable `NETOPS_SNMP_REAL_ENABLED=true`, confirm checklist, run single-device `POST /api/operational/interfaces/collect` for pilot `device_id=1` only.

**H2.1C prerequisites:**

1. `docker compose up -d --build api` with `NETOPS_SNMP_REAL_ENABLED=true` (explicit).
2. Pilot device SNMP community valid (already present on device 1 in lab).
3. `SNMP_FAST_PILOT_DEVICE_IDS=1`.
4. Rate limit: 1 collect / 5 min / device.
5. Verify GET returns `freshness` fresh/stale after successful collect.
