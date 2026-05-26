# PHASE BGP Peer Drilldown D6B — Cache/History UX Runtime Smoke

**Date:** 2026-05-26
**Base commit:** `043bfda` — `feat(bgp): improve drilldown cache and history UX`
**Pilot:** `device_id=1`, peer `172.28.1.138`
**Status:** GO

---

## 1. Scope

Runtime validation of D6 cache/history UX in Docker — **no SSH**, **no SNMP poll**, **no discovery**, no device/NetBox changes.

---

## 2. Runtime setup

Rebuild:

```bash
docker compose -f docker-compose.yml -f .d6b-compose.override.yml up -d --build api web
```

Override (ephemeral, not committed):

```yaml
services:
  api:
    environment:
      SNMP_POLL_ENABLED: "false"
      BGP_DRILLDOWN_SSH_DETAIL_ENABLED: "false"
```

Container env confirmed:

| Variable | Value |
|----------|-------|
| `SNMP_POLL_ENABLED` | **false** |
| `BGP_DRILLDOWN_SSH_DETAIL_ENABLED` | **false** |

API log:

```text
SNMP poller disabled
```

Containers:

| Service | Status | Port |
|---------|--------|------|
| `netops-api` | healthy | `8085→8080` |
| `netops-web` | healthy | `3005→80` |
| `netops-db` | healthy | `5435→5432` |

---

## 3. Health

```http
GET /api/healthz → 200 {"status":"ok"}
```

---

## 4. Drilldown normal

```http
GET /api/bgp/peers/1/172.28.1.138/drilldown?source=snapshot&include_policies=true&include_policy_objects=true
→ 200
```

**Cache meta (D6):**

```json
{
  "status": "fresh",
  "servedFromCache": true,
  "rowId": 1,
  "expiresAt": "2026-06-02T18:10:46.480Z",
  "configBuildSource": "raw_config"
}
```

| Check | Result |
|-------|--------|
| `configBuildSource` | `raw_config` |
| `routeTables.received.requested` | **false** |
| Root peer | `FOUND` |

---

## 5. Force recompute (no network)

```http
GET .../drilldown?...&force_recompute=true
→ 200
```

**Cache meta:**

```json
{
  "status": "recomputed",
  "servedFromCache": false,
  "rowId": null,
  "expiresAt": null,
  "configBuildSource": "raw_config"
}
```

DB after recompute: **2** history rows (`id` 1 and 2), both `raw_config`, `freshness=fresh`.

No SSH/SNMP/discovery log lines during requests.

---

## 6. History (enriched)

```http
GET /api/bgp/peers/1/172.28.1.138/drilldown/history
→ 200
```

| Field | Present |
|-------|---------|
| `count` | **2** (≥ 1) |
| `warningsCount` | **yes** |
| `freshnessStatus` | **yes** (`fresh`) |
| `configBuildSource` | **yes** |
| `source` | **yes** |
| `expiresAt` | **yes** |
| Sort | `collected_at` desc (newest first) |

---

## 7. Compare endpoint

Two distinct ids (`left=1`, `right=2`):

```http
GET .../history/compare?left=1&right=2
→ 200
```

| Diff section | Count |
|--------------|-------|
| `importPolicyChanges` | 0 |
| `exportPolicyChanges` | 0 |
| `enabledFamilyChanges` | 0 |
| `warningsAdded` | `[]` |
| `warningsRemoved` | `[]` |

Coherent: both snapshots built from same underlying config at same `collectedAt`.

Same id (`left=1&right=1`):

```http
→ 400 {"error":"left and right must be different snapshot ids"}
```

(API rejects self-compare; UI requires 2 distinct rows.)

---

## 8. SSH detail (protected)

```http
POST /api/bgp/peers/1/172.28.1.138/drilldown/detail
→ 503
```

```json
{
  "error": "BGP_DRILLDOWN_SSH_DETAIL_DISABLED",
  "message": "BGP SSH detail is disabled..."
}
```

---

## 9. UI smoke

```http
GET /bgp/peer-drilldown?deviceId=1&peer=172.28.1.138&auto=1
→ 200
```

Strings found in built SPA bundle (`index-*.js`):

| String | Found |
|--------|-------|
| `Histórico` | yes |
| `Recalcular snapshot` | yes |
| `Recalcular a partir` | yes |
| `Comparar selecionados` | yes |
| `Sem comandos no equipamento` | yes |
| `cache fresh` | yes |
| `force_recompute` | yes |
| `freshnessStatus` | yes |
| `warningsCount` | yes |
| `servedFromCache` | yes |

---

## 10. Logs / safety

| Check | Result |
|-------|--------|
| SNMP poll during smoke window | **disabled** (startup log only) |
| SSH connect / discovery | **none** |
| community / password in logs | **none** |

---

## 11. GO criteria

| Criterion | Met |
|-----------|-----|
| health OK | **yes** |
| drilldown normal OK | **yes** |
| force_recompute OK | **yes** |
| history OK | **yes** |
| compare OK | **yes** |
| UI contains D6 UX | **yes** |
| SSH detail protected | **yes** |
| zero SSH/SNMP/discovery | **yes** |

**Overall D6B runtime smoke: GO**

---

## 12. Notes

- Ephemeral compose override used for flags; not committed (per project rules).
- `NETOPS_SNMP_REAL_ENABLED` may still be `true` in `.env`; drilldown path uses DB snapshot only — no live SNMP for these endpoints.
- Compare self-id returns **400** by design; use two history rows in UI.
