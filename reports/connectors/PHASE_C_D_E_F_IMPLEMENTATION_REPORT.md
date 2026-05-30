# Phase C/D/E/F/G Implementation Report

**Date:** 2026-05-29  
**Scope:** Parse SSH bundle, populate L2/BGP, auto SNMP, UI status

## Summary

Implemented end-to-end post-SSH collection: bundle persistence, command splitting, BGP/L2 parsers, SNMP_FAST auto-enqueue, and device collection status UI.

## Deliverables

### Phase C — Persistence & parser dispatcher

| Item | Status |
|------|--------|
| Migration `0022_collected_configs_provenance.sql` | Done |
| Schema `collected_configs` provenance fields | Done |
| `config-bundle-parser.service.ts` | Done |
| `splitCommandBundle()` | Done |
| `parseAndPersistConfigBundle()` | Done |
| `processConfigBundleAfterSubmit()` integration | Done |

### Phase D — L2 Circuits

| Item | Status |
|------|--------|
| `persistL2CircuitsFromCommandOutputs()` | Done |
| Reuse Huawei L2VC/VSI parsers + findings | Done |
| Upsert `l2_circuits` | Done |

### Phase E — BGP

| Item | Status |
|------|--------|
| `persistBgpFromCommandOutputs()` | Done |
| Insert `snmp_snapshots` collector `ssh_bundle` | Done |

### Phase F — SNMP auto-collect

| Item | Status |
|------|--------|
| `connector-auto-collect.service.ts` | Done |
| `enqueuePostSshSuccessCollections()` | Done |
| SNMP_FAST when community set | Done |

### Phase G — UI status

| Item | Status |
|------|--------|
| `GET /devices/:id/collection-status` | Done |
| Device detail "Coleta via Connector" card | Done |
| Devices list SSH test toasts | Done |

## Tests

```bash
node tools/connectors-config-bundle-parse-selftest.mjs
node tools/connectors-post-ssh-autocollect-selftest.mjs
```

## Docs

- `docs/connectors/SSH_CONFIG_BUNDLE_PARSE_FLOW.md`
- `docs/connectors/POST_SSH_AUTOCOLLECT.md`
- `docs/connectors/L2_BGP_PARSE_FROM_BUNDLE.md`

## Deployment notes

1. Apply migration `0022` on Postgres before API restart
2. Rebuild `api-server` and `netops-manager` containers
3. NetOps CLI must support `SSH_CONFIG_BUNDLE` job type (116-NetOps_CLI)

## Known limitations

- BGP route-policy import/export from `current-configuration` is best-effort via generic parse
- Non-Huawei vendors use fallback command set; dedicated parsers not yet wired
- Production API at 4wnet.devops.k3gsolutions.com.br requires deploy after validation
