# Workflow: Feature flag / 503 / pilot debug

**Agents:** domain agent + `agents/qa-smoke.md`

## Steps

1. Read error `code` from API JSON (e.g. `L2_OPERATIONAL_REFRESH_DISABLED`, pilot 403)
2. Check gate file for domain:
   - L2: `l2-operational-refresh.gate.ts`
   - SNMP: `modules/netops/snmp/collect.ts`, `operational/pilot.ts`
   - BGP: `operational-bgp.gate.ts`
3. Inspect running container env (not only `.env` on disk):
   ```bash
   docker exec netops-api printenv | rg 'L2_|SNMP_|NETOPS_SNMP'
   ```
4. Fix compose override or `.env` → recreate container
5. Re-test single endpoint with curl/node smoke

## Common fixes

| Symptom | Fix |
|---------|-----|
| Pilot 403 | Add device id to `SNMP_FAST_PILOT_DEVICE_IDS` |
| Refresh 503 | `L2_OPERATIONAL_REFRESH_ENABLED=true` |
| SNMP empty | `NETOPS_SNMP_REAL_ENABLED=true` + community |

Do not enable all flags globally without user approval.
