# Discovery Persistence Model

Device Discovery persists normalized data and sanitized evidence in the local database so compliance, pre-check and BGP screens keep working after API restart.

Tables:

- `discovery_runs`: one row per discovery execution. Stores requested contexts, source flags, status, SSH/SNMP messages, cache usage, summaries, warnings and timestamps.
- `discovery_snapshots`: immutable normalized snapshots linked to a run. Stores `snapshot_json`, `source_summary_json`, `parser_version` and `snapshot_hash`.
- `discovery_evidence`: sanitized raw evidence linked to a run. Stores command/OID group, source, context, bounded output and sanitized error message.

Write rules:

- New live data is additive.
- Existing local facts are not deleted just because a fresh collection omitted them.
- Missing fresh items become candidate-removal warnings.
- Snapshot rows are deduplicated by content hash.
- Secrets are redacted before evidence is stored.

Read rules:

- `GET /api/devices/:id/discovery-snapshot` returns the latest persisted snapshot.
- BGP peers and peer details are served from the latest snapshot.
- If no snapshot exists, the API returns an explicit discovery-required error.

The Drizzle schema is in `workspace/lib/db/src/schema/discovery.ts`. A manual idempotent SQL migration is available at `workspace/lib/db/migrations/0001_device_discovery_persistence.sql`.
