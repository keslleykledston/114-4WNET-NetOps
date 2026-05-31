---
name: huawei-vrp-parsers
description: >-
  Guides Huawei VRP and S6730 CLI parsing: display mpls l2vc, display vsi
  verbose, dot1q subinterfaces, BGP route-policy. Use when adding parsers,
  fixtures, or fixing misclassification of NE8000 vs S6730 dialects.
---

# Huawei VRP Parsers

**Route:** `.cursor/agents/huawei-parser.md` → workflow `workflows/l2-change.md`

## Parser locations

| Area | Path |
|------|------|
| L2 | `modules/l2circuits/parsers/` |
| BGP/VRP | `modules/netops/huawei-vrp/` |
| Read-only gate | `modules/netops/huawei-vrp/commands.ts` |

## Dialect detection

| CLI style | Parser |
|-----------|--------|
| `***VSI Name`, `Peer Router ID` | S6730 (`s6730-l2.parser.ts`) |
| Dot blocks `...` | NE8000 (`huawei-vrp-l2.ts`) |
| `*client interface` | S6730 L2VC |

## Fixtures

- `parsers/__fixtures__/display-vsi-verbose.txt`
- `parsers/__fixtures__/display-vsi-rn141-multipoint.txt`
- `__fixtures__/manual-s6730-brt-a/`
- `__fixtures__/manual-device-1/`

## Adding a parser

1. Add fixture under `__fixtures__/`
2. Implement parse function; export via `parseHuaweiL2Circuits` or dedicated entry
3. Add selftest in `tools/l2-*-selftest.mjs` or new `tools/*-parser-selftest.mjs`
4. Run `node tools/...` + typecheck

## Classification

After parse: `classification.helpers.ts` → `normalizeCircuits` → `findings.resolver.ts`

## Safety

- Parsers are read-only analysis of CLI text
- Never add write commands to collectors
