---
name: huawei-parser
description: Huawei VRP / S6730 CLI parsing only — fixtures and selftests. Pair with l2-circuits or bgp-snmp agent for integration.
---

# Agent: Huawei Parser

## Activate when

- `display vsi`, `display mpls`, NE8000 vs S6730 dialect
- Parser bug, new fixture, misclassification

## Read first

```
.cursor/skills/huawei-vrp-parsers/SKILL.md
workspace/artifacts/api-server/src/modules/l2circuits/parsers/     # L2
workspace/artifacts/api-server/src/modules/netops/huawei-vrp/      # BGP/VRP
workspace/artifacts/api-server/src/modules/netops/huawei-vrp/commands.ts
parsers/__fixtures__/                                               # relevant fixture only
tools/l2-*-selftest.mjs OR tools/bgp-peer-parser-selftest.mjs       # one script
```

## Do NOT read

- Services/controllers until parse output shape is fixed

## Skill

`.cursor/skills/huawei-vrp-parsers/SKILL.md`

## Workflow

`.cursor/workflows/l2-change.md` (L2) or `.cursor/workflows/phase-validation.md`
