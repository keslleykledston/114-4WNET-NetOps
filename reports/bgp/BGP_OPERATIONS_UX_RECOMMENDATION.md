# BGP Operations UX Recommendation

## Recommendation

Keep the three experiences separate and link them together.

## Rationale

- Reduces regression risk.
- Preserves the NOC-friendly cockpit.
- Preserves the live operational health view.
- Preserves the deep technical drilldown.

## Bridge behavior

- `NetOps Operations` is the guided entry point.
- `BGP Operations` is the live health entry point.
- `BGP Drilldown` is the technical investigation entry point.

## Future editor placement

The future `BGP Policy Editor` should be opened from `BGP Drilldown`, not from the operational health page.

## Scope safety

- No screen was merged.
- No provisioning flow was changed.
- No route was removed.
- No apply/rollback behavior was introduced.

