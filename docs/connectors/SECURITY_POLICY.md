# Connector security policy (Phase 4)

## Secrets

- SSH passwords and SNMP communities are sent to the agent in `payload_json` only
- Audit logs and UI use `masked_payload_json` (`[redacted]`)
- Never log raw `payload_json` in application logs

## SSH read-only (server + agent)

Blocked patterns include: `configure`, `system-view`, `commit`, `delete`, `reload`, `shutdown`, `undo`, `set`, shell metacharacters (`;`, `&&`, `` ` ``, `$()`, pipes).

Allowed prefixes: `display`, `show`, `ping`, `traceroute`.

## Write operations

Phase 4 is **read-only**. No config apply, no destructive commands, no provisioning over connector.

## Connector availability

Jobs are not created when the connector is offline or without a recent heartbeat (2 minutes).
