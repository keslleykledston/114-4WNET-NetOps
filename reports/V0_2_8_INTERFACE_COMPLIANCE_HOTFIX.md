# v0.2.8 Interface Compliance Hotfix

**Date:** 2026-05-22  
**Scope:** Interface compliance false positives for subinterface dot1q checks  
**Device validated:** `1`

## Root Cause

The Huawei interface parser was parsing concatenated SSH command output with a broad fallback row matcher. BGP peer table rows such as `45.169.161.6 ... Established ...` matched the generic interface brief shape and were stored as interface objects.

The compliance rule then classified subinterfaces with `name.includes(".")`, so IPv4 addresses persisted as `interface.name` were treated as subinterfaces.

Examples observed in the latest persisted discovery snapshot before the fix:

- `45.169.161.6`
- `200.219.146.254`
- `189.23.156.121`

## Corrected Rule

- Added canonical interface identifier helpers:
  - `isIpv4Address`
  - `isIpv6Address`
  - `isIpAddress`
  - `isHuaweiInterfaceName`
  - `isHuaweiSubinterfaceName`
- Huawei parser now accepts only real Huawei interface names before creating interface objects.
- Discovery interface normalizer now drops invalid interface names from SSH/SNMP/cache/local sources.
- Compliance dot1q check now runs only when `isHuaweiSubinterfaceName(interface.name) === true`.
- Dot1q findings use `objectName = interface.name`.
- IP addresses are allowed only as evidence attributes, not as interface object names.

## Tests Executed

- `node tools/compliance-interface-classification-selftest.mjs`
- `pnpm -C workspace --filter @workspace/api-server typecheck`
- `pnpm -C workspace --filter @workspace/netops-manager typecheck`
- `BASE_PATH=/ PORT=5000 pnpm -C workspace run build`
- `COMPLIANCE_TEST_ADMIN_EMAIL=admin@netops.local COMPLIANCE_TEST_ADMIN_PASSWORD='Admin123!ChangeMe' DEVICE_ID=1 node tools/compliance-policy-tuning-selftest.mjs`
- `DOCKER_BUILDKIT=1 docker compose up -d --build api web`
- `docker compose ps`
- `curl -fsS http://127.0.0.1:8085/api/healthz`

## Device 1 Result

New compliance jobs for device 1 after the hotfix:

| Job | Profile | IP objectName dot1q false positives | Dot1q findings |
| --- | --- | ---: | ---: |
| 35 | `huawei-vrp-edge-balanced` | 0 | 0 |
| 36 | `huawei-vrp-observe-only` | 0 | 0 |
| 37 | `huawei-vrp-edge-strict` | 0 | 0 |

Historical rows remain in older jobs. Before the hotfix there were 245 historical findings where:

- `context = interface`
- message contained `Subinterface sem dot1q`
- `object_name` was an IPv4 address

The latest comparable pre-hotfix strict job had 49 such false positives; the post-hotfix strict job has 0.

## Snapshot Note

The latest persisted discovery snapshot still contains 49 stale interface objects whose `name` is an IPv4 address. The parser and normalizer are fixed so new discovery output will not create those objects, and the compliance check no longer treats stale IP-named objects as subinterfaces.

## Remaining Risks

- Old compliance jobs still contain historical false positives unless explicitly cleaned or hidden by job recency.
- Old discovery snapshots can still contain stale IP-named interface objects until discovery is rerun.
- The Huawei interface allowlist may need extension for additional platform-specific interface families if encountered.
