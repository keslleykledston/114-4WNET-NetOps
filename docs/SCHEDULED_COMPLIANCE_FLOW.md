# Scheduled Compliance Flow

## Flow

1. scheduler finds an enabled `compliance` job
2. target devices are resolved
3. last discovery snapshot is used when present
4. compliance job is created per device
5. compliance execution reuses compliance engine v2 with source/confidence
6. run item stores the compliance reference
7. summary is updated
8. audit log is written

## Missing snapshot

- if no discovery snapshot exists, compliance produces `unknown`/`warning` findings
- run item does not crash scheduler
- recommendation tells operator to execute discovery

## Output

- run header
- per-device items
- summary JSON
- audit trail
