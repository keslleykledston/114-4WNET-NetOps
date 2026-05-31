---
name: bgp-snmp
description: SNMP_FAST interfaces/BGP, operational BGP, BGP drilldown, pilot allowlist, Huawei VRP BGP parsers.
---

# Agent: BGP & SNMP

## Activate when

- `operational-bgp`, `operational/interfaces`, SNMP_FAST, RFC4273
- `bgp-drilldown`, peer drilldown, snapshot cache
- `NETOPS_SNMP_*`, `SNMP_FAST_PILOT_DEVICE_IDS`

## Read first

```
.cursor/skills/bgp-snmp-ops/SKILL.md
workspace/artifacts/api-server/src/modules/operational/pilot.ts
workspace/artifacts/api-server/src/modules/operational/operational.routes.ts
workspace/artifacts/api-server/src/modules/operational-bgp/
workspace/artifacts/api-server/src/modules/bgp-drilldown/
workspace/artifacts/api-server/src/modules/netops/snmp/
workspace/artifacts/api-server/src/modules/netops/huawei-vrp/
workspace/artifacts/netops-manager/src/features/operational-bgp/
workspace/artifacts/netops-manager/src/features/bgp-drilldown/
workspace/artifacts/netops-manager/src/pages/operational-bgp.tsx
workspace/lib/db/src/schema/operational.ts
workspace/lib/db/src/schema/operational_bgp.ts
```

## Do NOT read

- `modules/l2circuits/` (unless VLAN cross-finding)
- `reports/bgp/` unless validating a phase

## Skill

`.cursor/skills/bgp-snmp-ops/SKILL.md`

## Workflow

`.cursor/workflows/feature-flag-debug.md` (503/pilot) or `.cursor/workflows/phase-validation.md`
