# BGP Peer Drilldown — Safe Execution Checklist

Use before enabling SSH detail or route-table commands for **one peer** on **one device**.  
**Default:** read-only, allowlisted, single-peer, no bulk.

---

## Pre-flight (every drilldown SSH run)

- [ ] Target device in approved pilot/NOC list
- [ ] Peer IP validated (no injection in command templates)
- [ ] Command passes `validateReadonlyCommand()` (`huawei-vrp/commands.ts`)
- [ ] No `system-view`, `undo`, `reset`, `clear`, `save`, `commit`, `reboot`, `format`
- [ ] Passwords/ciphers redacted before persist (`discovery_evidence`, drilldown evidence)
- [ ] Audit event: `bgp_peer_drilldown_ssh` with device, peer, command template (not secrets)
- [ ] Concurrent drilldown SSH per device ≤ 1

---

## Command tiers

### Tier L — light (may run in BGP-D4 with peer scope)

| Command template |
|------------------|
| `display bgp peer <PEER>` |
| `display bgp peer <PEER> verbose` |
| `display route-policy <NAME>` |
| `display ip ip-prefix <NAME>` |
| `display ip ipv6-prefix <NAME>` |
| `display ip as-path-filter <NAME>` |
| `display ip community-filter <NAME>` |
| `display ip extcommunity-filter <NAME>` |
| `display current-configuration configuration bgp` (full-config snapshot job only — not per peer click) |

### Tier H — heavy (BGP-D5 only, explicit confirmation)

| Command template | Risk |
|------------------|------|
| `display bgp routing-table peer <PEER> received-routes` | Large output; needs `keep-all-routes` |
| `display bgp routing-table peer <PEER> accepted-routes` | Large output |
| `display bgp routing-table peer <PEER> advertised-routes` | Large output |

**Heavy requirements:**

- [ ] User confirmed impact dialog in UI (or API `confirmToken`)
- [ ] Timeout ≥ 120s (configurable `BGP_DRILLDOWN_ROUTE_TIMEOUT_MS`)
- [ ] Output limit / pagination (`BGP_DRILLDOWN_ROUTE_MAX_PREFIXES` or head lines)
- [ ] Rate limit: max 1 heavy route query / peer / 10 min
- [ ] Never scheduled; never fleet-wide
- [ ] Warning if `keep-all-routes` not detected and `received-routes` requested

### Tier X — forbidden

```
system-view | configure terminal
undo | delete | reset | clear | shutdown
save | write | commit | reboot | reload | format
peer .* (config-form)  # any mutating peer config
```

---

## Data safety

- [ ] Drilldown uses `raw_config` re-parse when available (`configBuildSource: raw_config`)
- [ ] Stale `parsed_config` alone → dependency **UNKNOWN**, not **MISSING**
- [ ] Drilldown result does not auto-fail compliance
- [ ] SNMP runtime and config planes labeled separately in API/UI
- [ ] No community strings or SNMP communities in API JSON

---

## BGP-D2 (snapshot-only) — allowed without SSH

- [ ] GET drilldown from DB `collected_configs` / `discovery_snapshots` only
- [ ] No new SSH sessions
- [ ] `include_routes=false` enforced

---

## BGP-D4/D5 exit criteria

- [ ] 3+ pilot peers drilled on lab device with Tier L only — no incident
- [ ] 1 peer Tier H test with NOC approval — output bounded
- [ ] Security review on allowlist additions for new `display` templates

---

## GO / NO-GO — SSH detail (future)

| Gate | Requirement |
|------|-------------|
| **GO Tier L (D4)** | D2 snapshot API stable; allowlist reviewed; pilot device list; audit logging on; no bulk |
| **GO Tier H (D5)** | D4 stable 1 week; NOC runbook; `keep-all-routes` warning; timeout + limit enforced; confirm token in API/UI |
| **NO-GO** | Any bulk peer drilldown; auto route-table on page load; community/password in logs; catalog UNKNOWN shown as MISSING |

**D2:** GO without SSH — snapshot/`raw_config` only.

---

## Quick reference — WIFIZAO example peer

Peer `172.28.1.138` — validate:

- Root: `as-number 262663`, `description WIFIZAO.BRT`
- Family `ipv4_unicast`: import/export policy names
- Policies resolve in catalog from full-config
- Route tables **not** auto-run in D2/D3
