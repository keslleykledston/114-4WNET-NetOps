# BGP Peer Details API

Endpoints:

- `POST /api/devices/:id/discover`
- `GET /api/devices/:id/discovery-snapshot`
- `GET /api/devices/:id/bgp/peers?category=customer`
- `GET /api/devices/:id/bgp/peers/:peerIp/details`
- `POST /api/devices/:id/bgp/peers/:peerIp/routes/query`

Peer details include summary, category, primary direction, import/export policies, route policy nodes, referenced prefixes, community filters, community lists, route counters, operational state, protections, and evidence metadata.

The peer contract mirrors the discovery list:

- `peerIp`
- `remoteAs`
- `description`
- `name`
- `state`
- `role`
- `roleSource`
- `addressFamily`
- `sessionType`
- `vrf`
- `importPolicy`
- `exportPolicy`
- `receivedPrefixes`
- `advertisedPrefixes`
- `activePrefixes`
- `uptime`
- `source`
- `category`
- `primaryDirection`
- `confidence`
- `evidence`

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

Role override contract:

- manual override wins over classifier and snapshot
- `unknown` is not a visible category in the UI
- legacy `unknown` roles are normalized to `customer`
- VRF peers are distinct discovery records, but the current override key remains `device_id + peer_ip + address_family`

The OpenAPI contract includes these endpoints and schemas. The frontend consumes generated client functions for discovery queries and keeps local wrapper types only where generated intersections would otherwise mix legacy `NetopsBgpPeer.source` with discovery source metadata.

If no persisted snapshot exists, discovery-backed BGP endpoints return:

```json
{ "error": "Nenhum discovery snapshot encontrado. Execute discovery primeiro." }
```

The frontend shows this as an empty state instead of attempting to parse CLI or SNMP output.
