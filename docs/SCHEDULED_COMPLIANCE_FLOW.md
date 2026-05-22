# Scheduled Compliance Flow

## Flow

1. scheduler finds an enabled `compliance` job
2. target devices are resolved
3. last discovery snapshot is used when present
4. compliance job is created per device
5. compliance execution reuses the current compliance engine
6. run item stores the compliance reference
7. summary is updated
8. audit log is written

## Missing snapshot

- if no discovery snapshot exists, the item fails with a controlled warning
- the run still completes

## Output

- run header
- per-device items
- summary JSON
- audit trail

