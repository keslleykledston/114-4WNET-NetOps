# SNMP read-only collection (FASE 5)

## Scope

- SNMP v2c GET/WALK only (IF-MIB + BGP4-MIB IPv4).
- No SNMP SET, no SSH, no router config changes, no provisioning changes.
- Secrets (`snmpCommunity`, `passwordEncrypted`) never returned in NetOps API responses.

## Feature flag

```bash
NETOPS_SNMP_REAL_ENABLED=false   # default — collect returns executed=false
NETOPS_SNMP_REAL_ENABLED=true    # enable real GET/WALK on POST collect/read-only
```

Docker Compose (`api` service) exposes `NETOPS_SNMP_REAL_ENABLED` (default `false`).

## Endpoint

```http
POST /api/netops/devices/:id/collect/read-only
```

Flow:

1. Load device; require `snmpCommunity` when flag is `true`.
2. If flag `false` → `executed: false` with friendly message (no DB write).
3. If flag `true` → walk OIDs, insert new row in `snmp_snapshots` (failed runs do not delete prior snapshots).
4. `GET` interfaces / bgp-peers read latest snapshot via `snapshot-adapter` (`source=snmp` when applicable).

## OIDs

| MIB | OID | Field |
|-----|-----|-------|
| IF-MIB | 1.3.6.1.2.1.2.2.1.2 | ifDescr |
| IF-MIB | 1.3.6.1.2.1.2.2.1.3 | ifType |
| IF-MIB | 1.3.6.1.2.1.2.2.1.4 | ifMtu |
| IF-MIB | 1.3.6.1.2.1.2.2.1.5 | ifSpeed |
| IF-MIB | 1.3.6.1.2.1.2.2.1.6 | ifPhysAddress |
| IF-MIB | 1.3.6.1.2.1.2.2.1.7 | ifAdminStatus |
| IF-MIB | 1.3.6.1.2.1.2.2.1.8 | ifOperStatus |
| IF-MIB | 1.3.6.1.2.1.2.2.1.9 | ifLastChange (walked; not persisted in normalized row) |
| ifXTable | 1.3.6.1.2.1.31.1.1.1.1 | ifName |
| ifXTable | 1.3.6.1.2.1.31.1.1.1.6 | ifHCInOctets |
| ifXTable | 1.3.6.1.2.1.31.1.1.1.10 | ifHCOutOctets |
| ifXTable | 1.3.6.1.2.1.31.1.1.1.18 | ifAlias |
| BGP4-MIB | 1.3.6.1.2.1.15.3.1.2 | bgpPeerState |
| BGP4-MIB | 1.3.6.1.2.1.15.3.1.7 | bgpPeerRemoteAddr |
| BGP4-MIB | 1.3.6.1.2.1.15.3.1.9 | bgpPeerRemoteAs |
| BGP4-MIB | 1.3.6.1.2.1.15.3.1.10 | bgpPeerInUpdates |
| BGP4-MIB | 1.3.6.1.2.1.15.3.1.11 | bgpPeerOutUpdates |
| BGP4-MIB | 1.3.6.1.2.1.15.3.1.16 | bgpPeerFsmEstablishedTime |

BGP state map: `1 idle`, `2 connect`, `3 active`, `4 opensent`, `5 openconfirm`, `6 established`.

## IPv6 gap

`60-bgp_manager` does not implement BGP4-MIB IPv6 peer walks. FASE 5 follows the same boundary: only standard **BGP4-MIB IPv4** peer table. IPv6 peers may appear as `addressFamily: ipv6` only if the agent exposes them in that table with a decodable address; no invented data.

## Role precedence

Unchanged: `manual_override` > classifier > snmp/snapshot > unknown (overrides applied in `service.ts` after snapshot load).

## Code layout

- `workspace/artifacts/api-server/src/modules/netops/snmp/*` — collector
- `workspace/artifacts/api-server/src/modules/netops/adapters/snmp-readonly-adapter.ts` — flag + adapter
- `workspace/artifacts/api-server/src/modules/netops/adapters/snapshot-adapter.ts` — GET normalization
- `workspace/artifacts/netops-manager/src/features/device-inventory/collect-snmp-button.tsx` — UI

## Limitations

- No per-VRF BGP (MPLS-VPN-MIB not in FASE 5 minimum).
- No prefix counts via SNMP in this phase.
- Background poller (`lib/snmp-poller.ts`) remains separate; uses legacy `lib/snmp.ts` (Huawei enterprise BGP when applicable).
- Timeouts: 5s, 1 retry, SNMPv2c only.
