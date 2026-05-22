# Scheduled Discovery Flow

## Flow

1. scheduler finds an enabled `discovery` job
2. target devices are resolved
3. discovery runs per device
4. SSH live is preferred
5. SNMP fallback stays allowed
6. discovery snapshot is persisted
7. run item stores the discovery reference
8. summary is updated
9. audit log is written

## Failsafe

- one device can fail
- run still finishes
- failure becomes `partial` or `failed`

## Output

- run header
- per-device items
- summary JSON
- audit trail

