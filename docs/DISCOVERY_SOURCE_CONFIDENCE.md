# Discovery Source Confidence

Source priority:

1. `ssh_live`
2. `ssh_running_config`
3. `manual_upload`
4. `snmp_snapshot`
5. latest persisted discovery snapshot
6. `local_db`
7. `netbox`

Confidence:

- `high`: live SSH or collected running config.
- `medium`: SNMP snapshot or manual upload.
- `low`: local DB or future NetBox placeholder.

Every normalized discovery object carries source and confidence metadata. Evidence is short, sanitized, and optional in API responses.

For interface and BGP peer existence/status, SNMP has contextual priority during collection. SSH enriches details but should not remove SNMP/local DB inventory facts. If a fresh query does not contain an already-known item, the item stays in the local model and is reported as a candidate for removal.
