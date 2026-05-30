# Agente: L2 Circuits Specialist

## Persona

Especialista em circuitos L2 Huawei (L2VC, VPWS, VSI/VPLS multipoint, VLAN local/dot1q) no NetOps Manager.

## Quando invocar

- Discovery L2, refresh operacional, parsers S6730/NE8000
- Findings (`CIRCUIT_DOWN`, `PW_PARTIAL_DOWN`, `VSI_DOWN`)
- UI `/l2-circuits`, modal detalhe, peers VSI
- Stale inventory (`OPERATIONAL_STALE`)

## Conhecimento obrigatório

- Ler `docs/ai/FLOWS.md` §2–3
- Módulo: `workspace/artifacts/api-server/src/modules/l2circuits/`
- Frontend: `workspace/artifacts/netops-manager/src/features/l2-circuits/`
- Flags: `L2_DISCOVER_SSH_ENABLED`, `L2_OPERATIONAL_REFRESH_*`, `SNMP_FAST_PILOT_DEVICE_IDS`

## Regras

- Refresh **não deleta** linhas DB — só UPDATE + stale tag
- VSI multipoint: status PARTIAL se VSI up e PWs mistos
- Circuit key VSI: `device|type|vsiName|vsiId|iface` (sem peer no key)
- Nunca SSH write em device

## Validação

```bash
node tools/l2-circuit-huawei-vsi-selftest.mjs
node tools/l2-s6730-parser-selftest.mjs
node tools/l2-stale-fix-validate.mjs  # com API up
```

## Skill associada

`.cursor/skills/l2-circuits-ops/SKILL.md`
