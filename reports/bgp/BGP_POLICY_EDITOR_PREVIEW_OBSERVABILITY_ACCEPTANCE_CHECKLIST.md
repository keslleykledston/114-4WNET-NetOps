# BGP Policy Editor Preview Observability Acceptance Checklist

- [x] preview backend success event exists
- [x] preview backend failed event exists
- [x] preview local used event exists
- [x] preview local fallback event exists
- [x] preview drift detected event exists
- [x] UI shows preview origin
- [x] UI shows drift
- [x] UI shows last backend error
- [x] apply disabled
- [x] rollback disabled
- [x] no SSH write
- [x] no migration
- [x] provisioning unchanged
- [x] secrets not logged
- [x] typecheck ok
- [x] build ok
- [x] provisioning regression ok
- [x] runtime smoke ok

## Notes

- Preview observability is advisory only.
- Local fallback remains allowed.
- Drift detection remains non-blocking.
- Safety remains read-only with `dryRun=true`.
