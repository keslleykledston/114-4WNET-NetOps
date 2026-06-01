# BGP Operations vs BGP Drilldown Analysis

**Status:** read-only analysis; navigation bridge phase 1

## Decision

The product keeps three separate experiences:

- **BGP Operations**: live operational health and freshness.
- **NetOps Operations**: guided cockpit for device-centric navigation.
- **BGP Drilldown**: deep peer-level technical analysis.

They are not merged in this phase.

## Why keep them separate

- Operational data and technical config evidence solve different tasks.
- `BGP Operations` is optimized for quick health checks, not configuration explanation.
- `NetOps Operations` is optimized for guided discovery by device/customer.
- `BGP Drilldown` is the right place for route-policy reasoning and future policy editing.

## Bridge rules

- `NetOps Operations` can open `BGP Drilldown` for a selected peer.
- `BGP Operations` can open `BGP Drilldown` for a selected peer.
- `BGP Drilldown` can return to the device cockpit in `NetOps Operations`.

## Future policy editor placement

The future `BGP Policy Editor` should start inside `BGP Drilldown`, because that page already owns:

- peer-scoped context
- import/export policy trees
- route-policy nodes
- dependency evidence
- history/comparison

## Regression posture

No route was removed. No provisioning flow was touched. The change is navigation-only.
