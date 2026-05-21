# Device Discovery Architecture

Device discovery is a read-only query layer for registered devices. The frontend never parses CLI or SNMP OIDs; it consumes normalized API objects.

Flow:

1. Device Query Request
2. DeviceResolver
3. CredentialResolver
4. CollectionOrchestrator
5. SNMP Collector primary for BGP/interface inventory
6. SSH Collector complement for config/policy/details
7. Raw Evidence Store
8. Parser
9. Normalizer
10. Domain Model
11. API
12. Frontend

The implementation lives in `workspace/artifacts/api-server/src/modules/netops/device-discovery`. It reuses existing SSH execution, Huawei VRP read-only allowlist, SNMP readonly adapter, and Huawei parsers.

Discovery is now persisted in dedicated local tables:

- `discovery_runs`: request flags, source status, summary, warnings and timestamps.
- `discovery_snapshots`: normalized snapshot JSON, source summary, parser version and content hash.
- `discovery_evidence`: sanitized raw evidence by command/OID group, never returned by default.

The in-process store remains only as a short-lived cache for the running API process. After restart, the service reads the latest `discovery_snapshots` row and keeps BGP peers/interfaces available for pre-check and compliance.

New collection data is additive. Existing local facts are preserved when a fresh query lacks an item, and discovery emits candidate-removal warnings instead of deleting local data.
