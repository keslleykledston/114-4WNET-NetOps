# BGP Peer Details API

Endpoints:

- `POST /api/devices/:id/discover`
- `GET /api/devices/:id/discovery-snapshot`
- `GET /api/devices/:id/bgp/peers?category=customer`
- `GET /api/devices/:id/bgp/peers/:peerIp/details`
- `POST /api/devices/:id/bgp/peers/:peerIp/routes/query`

Peer details include summary, category, primary direction, import/export policies, route policy nodes, referenced prefixes, community filters, community lists, route counters, operational state, protections, and evidence metadata.

Primary direction is decided by backend:

- Customer: `import`
- Provider/CDN/IX/CDN-IX: `export`
- iBGP: `internal`

Route protection:

- `receivedRoutes > 5000` sets `largeReceivedRoutes=true`
- `advertisedRoutes > 5000` sets `largeAdvertisedRoutes=true`
- `autoLoadRoutes=false`
- `requiresExplicitRouteSearch=true`
- full route dump is never automatic

The OpenAPI contract includes these endpoints and schemas. The frontend consumes generated client functions for discovery queries and keeps local wrapper types only where generated intersections would otherwise mix legacy `NetopsBgpPeer.source` with discovery source metadata.

If no persisted snapshot exists, discovery-backed BGP endpoints return:

```json
{ "error": "Nenhum discovery snapshot encontrado. Execute discovery primeiro." }
```

The frontend shows this as an empty state instead of attempting to parse CLI or SNMP output.
