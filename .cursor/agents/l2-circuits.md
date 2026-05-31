---
name: l2-circuits
description: L2 Circuits — parsers, refresh, findings, VSI multipoint, /l2-circuits UI. Use for discovery, operational refresh, stale inventory, PW_PARTIAL_DOWN.
---

# Agent: L2 Circuits

## Activate when

- `l2circuits`, VSI, L2VC, VPWS, dot1q, `display vsi`, `display mpls l2vc`
- `/l2-circuits`, refresh operacional, `OPERATIONAL_STALE`
- Findings: `CIRCUIT_DOWN`, `VSI_DOWN`, `PW_PARTIAL_DOWN`

## Read first (bounded — max ~12 files)

```
.cursor/skills/l2-circuits-ops/SKILL.md
workspace/artifacts/api-server/src/modules/l2circuits/l2circuits.routes.ts
workspace/artifacts/api-server/src/modules/l2circuits/l2circuits.service.ts
workspace/artifacts/api-server/src/modules/l2circuits/parsers/huawei-vrp-l2.ts
workspace/artifacts/api-server/src/modules/l2circuits/parsers/s6730-l2.parser.ts
workspace/artifacts/api-server/src/modules/l2circuits/parsers/vsi-multipoint.helpers.ts
workspace/artifacts/api-server/src/modules/l2circuits/normalizers/findings.resolver.ts
workspace/artifacts/api-server/src/modules/l2circuits/operational-refresh/l2-operational-refresh.service.ts
workspace/artifacts/netops-manager/src/features/l2-circuits/
workspace/artifacts/netops-manager/src/pages/l2-circuits.tsx
workspace/lib/db/src/schema/l2circuits.ts
workspace/lib/db/src/schema/l2_operational.ts
```

Fixture (if parser): `parsers/__fixtures__/display-vsi-rn141-multipoint.txt`

## Do NOT read (unless user asks)

- `modules/netops/` (BGP unrelated)
- `modules/connectors/`
- `reports/l2-circuits/` (historical)
- Entire `docs/` tree

## Skill

`.cursor/skills/l2-circuits-ops/SKILL.md`

## Workflow

`.cursor/workflows/l2-change.md`

## Flags

`L2_DISCOVER_SSH_ENABLED`, `L2_OPERATIONAL_REFRESH_ENABLED`, `NETOPS_SNMP_REAL_ENABLED`, `SNMP_FAST_PILOT_DEVICE_IDS`

Details: `docs/ai/DEPENDENCIES.md` § L2 only.
