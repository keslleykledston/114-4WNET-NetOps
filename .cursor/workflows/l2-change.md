# Workflow: L2 Circuits change

**Agent:** `agents/l2-circuits.md`  
**Skill:** `skills/l2-circuits-ops/`

## Steps

1. Confirm task type: parser | refresh | findings | UI | stale
2. Read **only** files in agent "Read first" (≤12)
3. Check flags in `operational-refresh/l2-operational-refresh.gate.ts` if runtime
4. Implement minimal diff in `modules/l2circuits/` and/or `features/l2-circuits/`
5. Run:
   ```bash
   node tools/l2-circuit-huawei-vsi-selftest.mjs
   node tools/l2-s6730-parser-selftest.mjs
   cd workspace && pnpm run typecheck
   ```
6. If API/UI runtime: `tools/apply-containers.sh api web`
7. Optional smoke: `node tools/l2-stale-fix-validate.mjs` (API up, flags ON, pilot device)

## VSI multipoint checklist

- [ ] Multiple peers in `peers[]`, not single `peerIp` overwrite
- [ ] `PARTIAL` when mixed; `PW_PARTIAL_DOWN` not `VSI_DOWN`
- [ ] Circuit key without `peerIp` for vsi/vpls

## Stop conditions

- Need new DB column → switch to `workflows/db-migration.md`
- Need new API field in OpenAPI → also `workflows/api-endpoint.md`
