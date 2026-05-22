# BGP Role Override and VRF Contract

## Context

The BGP screen in `114-4WNET-NetOps` is an operational inventory view. It is not a raw CLI parser in the frontend. The API must return normalized peers that the UI can filter by role and address family without reinterpreting SNMP counters or router output.

The current collection flow uses:

- SNMP for peer existence, session state and interface inventory.
- SSH for Huawei VRP verbose output, VRFs, route-policies and route counters.
- Local manual overrides for operator-assigned BGP role.

## Business Rules

1. `unknown` is not a user-facing role category.
2. If the classifier cannot determine a role, the normalized role defaults to `customer`.
3. Manual role override always wins over classifier or snapshot values.
4. Legacy stored `unknown` roles are rewritten or normalized to `customer` on read.
5. VRF peers must be collected as distinct operational peers, even when the same peer IP exists in more than one routing context.
6. BGP route queries must use the peer VRF when present.
7. The frontend must show the peer immediately in the selected filtered category after save.

## Identity and Precedence

### Peer identity for discovery views

Discovery treats a peer as a distinct record by:

- `peerIp`
- `addressFamily`
- `vrf`

This prevents global and VRF-scoped peers from being collapsed into one record during discovery and route lookup.

### Override identity for persistence

The manual role override table currently keys by:

- `device_id`
- `peer_ip`
- `address_family`

`vrf` is not part of the override key yet. That is the current contract. If per-VRF overrides are needed later, the schema must change first.

### Role precedence

```text
manual_override > classifier > snapshot > customer(default)
```

`roleSource` must reflect where the value came from:

- `manual_override`
- `classifier`
- `snapshot`
- `unknown` only as an internal low-level fallback, never as a visible category

## API Contract

### Discovery list

`GET /api/devices/:id/bgp/peers?category=...`

Returns normalized peers already enriched with:

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
- `category`
- `primaryDirection`
- `largeReceivedRoutes`
- `largeAdvertisedRoutes`
- `requiresExplicitRouteSearch`
- `source`
- `confidence`
- `evidence`

### Peer details

`GET /api/devices/:id/bgp/peers/:peerIp/details`

Must return the same peer identity and operational metadata as the list endpoint, plus:

- route policy nodes
- referenced prefixes
- referenced community filters/lists
- route counters
- protections

### Role update

`PUT /api/netops/devices/:id/bgp-peers/:peerIp/role`

Contract:

- saves a manual override
- does not touch router configuration
- must be reflected on the next discovery list read
- must update the filtered category view in the UI

## Collection Contract

### SSH

SSH collection must query:

- `display bgp peer verbose`
- `display bgp ipv6 peer verbose`
- `display bgp vpnv4 vpn-instance <VRF> peer verbose`
- `display bgp vpnv6 vpn-instance <VRF> peer verbose`

### SNMP

SNMP collection provides peer existence and state, but it does not define the business role. SNMP fallback must still apply manual role overrides before exposing peers to the UI.

## UI Contract

The BGP tree and peer list must expose only operational categories:

- `Cliente`
- `Operadora`
- `CDN`
- `IX`
- `CDN/IX`
- `iBGP`

`Unknown` is legacy-only and must not be shown as a navigable category.

