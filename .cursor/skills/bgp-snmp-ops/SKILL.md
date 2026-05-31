---
name: bgp-snmp-ops
description: >-
  SNMP_FAST interfaces and BGP (RFC4273), operational freshness, BGP peer
  drilldown, pilot allowlist. Use for operational/bgp pages, SNMP collection,
  drilldown cache, or pilot 403 errors.
---

# BGP & SNMP Operations

**Agent:** `.cursor/agents/bgp-snmp.md`  
**Workflow:** `.cursor/workflows/feature-flag-debug.md` or `phase-validation.md`

## Bounded paths

| Area | Path |
|------|------|
| Pilot | `modules/operational/pilot.ts` |
| IF collect | `modules/operational/snmp-fast-interfaces.service.ts` |
| BGP collect | `modules/operational-bgp/` |
| Drilldown | `modules/bgp-drilldown/` |
| SNMP core | `modules/netops/snmp/collect.ts`, `snmp-credential-resolver.ts` |
| VRP parsers | `modules/netops/huawei-vrp/` |
| UI | `features/operational-bgp/`, `features/bgp-drilldown/` |

## Flags

| Flag | Module |
|------|--------|
| `NETOPS_SNMP_REAL_ENABLED` | snmp collect |
| `NETOPS_SNMP_BGP_REAL_ENABLED` | operational-bgp gate |
| `SNMP_FAST_PILOT_DEVICE_IDS` | pilot.ts |
| `BGP_DRILLDOWN_SSH_DETAIL_ENABLED` | drilldown |

## Tests

```bash
node tools/snmp-fast-operational-selftest.mjs
node tools/snmp-fast-bgp-selftest.mjs
node tools/operational-pilot-smoke.mjs
```

## Rules

- 403 = device not in pilot allowlist
- Read-only SNMP/SSH only
