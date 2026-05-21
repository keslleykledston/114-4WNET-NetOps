# SSH SNMP Fallback Flow

Discovery uses SNMP first for BGP peer and interface inventory. SSH is used for details that SNMP cannot provide well, especially running-config, route-policies, communities, VRFs and L2VPN.

Fallback rules:

1. SNMP snapshot is primary for interface and BGP peer existence/status.
2. SSH live collection complements SNMP with policy/config details.
3. Latest local DB snapshot is loaded to preserve known-good data.
4. Latest collected config is used when live collection cannot provide enough data and `useCachedConfig=true`.
5. If no collected config exists, the latest persisted `discovery_snapshots` row is used as cache.
6. New data is additive; missing live data does not delete local DB data.
7. If a local interface or BGP peer is absent from the new collection, discovery emits a candidate-removal warning.
8. If no live, cached, or local source has usable data, discovery returns `failed`.
9. Manual BGP role overrides are re-applied even when discovery falls back to SNMP-only peers.
10. VRF-scoped BGP peers are collected separately via SSH `vpnv4` / `vpnv6` verbose commands and are not collapsed into the global list.

Statuses:

- `full`: SNMP inventory and SSH detail collection both succeeded.
- `partial`: one live source succeeded without enough complementary data.
- `fallback`: SSH failed, but SNMP plus cached config preserved enough data for normalized output.
- `cached`: live collection failed and cached config or local DB data was used.
- `failed`: no usable source.

No configuration mode, destructive command, rollback, or frontend-supplied free command is allowed.
