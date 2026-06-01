# BGP Navigation Context Bridge

This document records the navigation bridge introduced between:

- `NetOps Operations`
- `BGP Operations`
- `BGP Drilldown`

## Added links

- `NetOps Operations` peer entries can open `BGP Drilldown`.
- `BGP Operations` peer rows can open `BGP Drilldown`.
- `BGP Drilldown` can return to `NetOps Operations` with `deviceId` in the query string.

## Query bridge

Supported query parameters:

- `deviceId`
- `device_id`
- `peer`
- `peerIp`
- `auto`

The bridge is non-destructive and preserves existing routes.

## Responsibilities

- `NetOps Operations`: guided cockpit for device context and BGP categories.
- `BGP Operations`: live BGP health view sourced from operational SNMP data.
- `BGP Drilldown`: detailed peer investigation with policy tree and evidence.

## Decision record

Do not merge the three screens in this phase.
Do not add the BGP Policy Editor yet.
Use the drilldown as the future editor entry point.

