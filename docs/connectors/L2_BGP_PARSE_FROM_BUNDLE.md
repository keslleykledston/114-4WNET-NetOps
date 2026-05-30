# L2 and BGP Parse from SSH Bundle

## Commands used

| Command | Module |
|---------|--------|
| `display current-configuration` | Generic config parse, route-policy hints |
| `display bgp peer` | BGP peer list |
| `display bgp peer verbose` | BGP state, uptime, ASN |
| `display mpls l2vc verbose` | L2VC / VPWS |
| `display vsi verbose` | VSI / VPLS |
| `display interface description` | Interface labels |
| `display interface brief` | Oper/admin status |

## L2 — persistL2CircuitsFromCommandOutputs

Reuses existing parsers:

- `parseHuaweiL2Circuits` (huawei-vrp-l2.ts)
- `normalizeCircuits`, `enrichCircuitsWithFindings`, `resolveL2Findings`
- `mergeVsiOperationalEvidence` (vsi-multipoint.helpers.ts)
- `buildCircuitKey` for upsert into `l2_circuits`

### Classification

Circuits receive UP / DOWN / PARTIAL / CONFIG_ONLY / UNKNOWN based on operational evidence. VSI multipoint with mixed PW states stays **PARTIAL** — a single down PW does not generate a false CIRCUIT_DOWN for the whole service.

### Persistence

- Upsert by circuit key per device
- `source = connector_ssh_bundle`
- `lastSeen` updated on each parse run

## BGP — persistBgpFromCommandOutputs

Reuses `parseHuaweiBgpPeers` from bgp-peer-parser.ts.

### Persistence

Inserts into `snmp_snapshots` with `collector = ssh_bundle`:

- `bgpPeersJson` — parsed peers (IPv4/IPv6 when present)
- `interfacesJson` — from `display interface brief`
- Does not overwrite or delete existing SNMP collector snapshots

Missing fields remain UNKNOWN; parse errors are recorded in `parser_error` without failing the whole job.

## Parser dispatcher

`parseAndPersistConfigBundle()` orchestrates:

1. Generic `parseConfig()` → VLANs, interfaces in `collected_configs`
2. BGP persist
3. L2 persist
4. Final `parser_status` and `parsed_summary_json`

## Acceptance criteria

After SSH test on connector device:

- [x] `collected_configs` has raw bundle
- [x] `l2_circuits` populated/updated
- [x] BGP panel reads latest `snmp_snapshots` with `ssh_bundle` collector
- [x] UI shows parse status and counts
- [x] Partial parse does not crash job
