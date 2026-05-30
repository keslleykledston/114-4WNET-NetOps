# SSH_CONFIG_BUNDLE — Parse Flow

## Overview

After a successful SSH connectivity test on a connector-backed device, the server enqueues `SSH_CONFIG_BUNDLE`. When the connector agent returns the raw bundle, the API persists it and parses BGP, L2, and interface data asynchronously.

## Flow

```text
Test SSH (display version)
  ↓ OK
enqueuePostSshSuccessCollections()
  ├── SSH_CONFIG_BUNDLE (always)
  └── SNMP_FAST (if snmpCommunity configured)
  ↓
Connector agent runs read-only commands
  ↓
POST /connectors/:id/jobs/:jobId/result
  ↓
processConfigBundleAfterSubmit()
  ├── INSERT collected_configs (source=connector_ssh_bundle, parser_status=PENDING)
  └── setImmediate → parseAndPersistConfigBundle()
        ├── splitCommandBundle()
        ├── persistBgpFromCommandOutputs()
        ├── persistL2CircuitsFromCommandOutputs()
        └── UPDATE parser_status (SUCCESS | PARTIAL | FAILED)
```

## Bundle format

Sections are separated by headers:

```text
! === display current-configuration ===
...
! === display bgp peer ===
...
```

`splitCommandBundle()` returns `Record<command, output>`.

## collected_configs fields

| Field | Description |
|-------|-------------|
| `device_id` | Target device |
| `connector_id` | Connector used |
| `source` | `connector_ssh_bundle` |
| `raw_config` | Full bundle stdout |
| `collected_at` | Timestamp |
| `parser_status` | PENDING → SUCCESS / PARTIAL / FAILED |
| `parser_error` | Semicolon-joined partial errors |
| `parsed_summary_json` | `{ bgpPeerCount, l2CircuitCount, interfaceCount, vlanCount, errors }` |

## Parser resilience

Partial parser failures do not abort the job. Each sub-parser runs in its own try/catch; `parser_status` reflects overall outcome.

## Security

Only read-only Huawei VRP commands are allowed. See `ssh-readonly-policy.ts` and `HUAWEI_SSH_CONFIG_BUNDLE_COMMANDS`.

## API

- `GET /api/devices/:id/collection-status` — last bundle, parse status, BGP/L2 counts
- `GET /api/devices/:id/collected-config` — latest raw config + parser metadata

## Related

- `config-bundle-parser.service.ts`
- `connector-config-collect.service.ts`
- `connector-auto-collect.service.ts`
