# Phase 4 implementation report

## Delivered

- `connector-execution.service.ts` — enqueue + `waitForJobResult`
- `connector-payload-mask.ts` — secret masking
- Expanded `ssh-readonly-policy.ts`
- Migration `0021_connector_jobs_phase4.sql` — `device_id`, `correlation_id`, `masked_payload_json`
- Device API/UI — `connectorId`, access badge, diagnostics endpoint
- Integrations: device tests, SNMP_FAST, L2 SSH, BGP drilldown SSH
- Connector jobs UI — enriched list + result viewer
- Docs + `tools/connectors-phase4-selftest.mjs`

## Validation

```bash
node tools/connectors-selftest.mjs
node tools/connectors-phase4-selftest.mjs
cd workspace && pnpm --filter @workspace/api-server run typecheck
docker compose build api web && docker compose up -d
docker exec -i netops-db psql -U netops -d netops < workspace/lib/db/migrations/0021_connector_jobs_phase4.sql
```

## Notes

- Operational BGP SNMP still uses direct mode unless extended in a follow-up
- Connector agent must be **ONLINE** with valid token for jobs to complete
- Apply migration `0021` on existing deployments before using Phase 4 features
