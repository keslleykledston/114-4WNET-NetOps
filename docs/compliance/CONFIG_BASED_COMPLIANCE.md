# Compliance Based on Backup/Config — Complete Reference

## Overview

**Config-based compliance:** Evaluate device configurations from collected backups, not live device queries. Generate findings, categorize by severity, track audit trail.

## System Architecture

### Data Flow
```
Collected Config (SSH backup)
    ↓
Compliance Engine (snapshot-based checks)
    ├→ BGP peer checks
    ├→ Interface description checks
    ├→ Security config checks
    ├→ VRF/L2VPN checks
    ↓
Compliance Findings (pass/fail/warning/unknown)
    ↓
Report Export (CSV/JSON/Markdown, PII-sanitized)
    ↓
Audit Trail (all operations logged)
```

## Database Schema

### compliance_policies
Policy definitions with check rules.

| Field | Type | Notes |
|-------|------|-------|
| id | serial | PK |
| name | text | e.g., "bgp-peer-description" |
| description | text | Check purpose |
| context | text | bgp, interface, security, vrf, l2vpn, ntp |
| severity | text | error, warning, info |
| ruleType | text | presence, pattern, comparison, threshold |
| rulePattern | text | Regex or logic |
| vendor | text | huawei, cisco, arista, etc. |
| enabled | boolean | Check active? |
| createdAt | timestamp | |

### compliance_jobs
Compliance run execution per device.

| Field | Type | Notes |
|-------|------|-------|
| id | serial | PK |
| deviceId | integer | FK → devices |
| contexts | text[] | Selected contexts (bgp, interface, etc.) |
| policyProfileName | text | Profile: huawei-vrp-edge-strict, -balanced, -observe-only |
| status | text | pending, running, passed, failed |
| passCount | integer | Passed findings |
| failCount | integer | Failed findings |
| errorMessage | text | If failed |
| startedAt | timestamp | Job start |
| completedAt | timestamp | Job end |
| createdAt | timestamp | |

### compliance_findings
Individual check results.

| Field | Type | Notes |
|-------|------|-------|
| id | serial | PK |
| jobId | integer | FK → compliance_jobs |
| policyId | integer | FK → compliance_policies |
| policyName | text | Rule name |
| severity | text | error, warning, info |
| context | text | bgp, interface, security, etc. |
| result | text | pass, fail, warning, unknown |
| detail | text | Check detail |
| evidence | text | Config excerpt (sanitized) |
| status | text | active, ignored, fixed |
| message | text | Result message |
| recommendation | text | How to fix |
| blocking | boolean | Blocks operations? |
| source | text | snapshot, config, fallback |
| confidence | text | high, medium, low |
| objectType | text | bgp_peer, interface, vlan, etc. |
| objectId | text | e.g., "peer-10.10.1.1" |
| objectName | text | e.g., "ISP-PRIMARY" |
| operationalCategory | text | BLOCKER_REAL, RISCO_OPERACIONAL, PADRONIZACAO, INFORMATIVO, etc. |
| metadataJson | jsonb | Additional context |

### compliance_policy_profiles
Profile templates by device role/vendor/platform.

| Field | Type | Notes |
|-------|------|-------|
| id | serial | PK |
| name | text | unique: "huawei-vrp-edge-strict" |
| description | text | Profile purpose |
| deviceRole | text | router, switch, firewall |
| vendor | text | huawei, cisco, etc. |
| platform | text | vrp, ios, eos |
| enabled | boolean | In use? |
| rulesJson | jsonb | Severity overrides per rule |
| thresholdsJson | jsonb | Pass/fail/warning counts |

**Built-in Profiles:**
1. `huawei-vrp-edge-strict` — All checks, zero-tolerance (blocking: error-level)
2. `huawei-vrp-edge-balanced` — Key checks, block on critical issues
3. `huawei-vrp-observe-only` — Informational only, no blocking

## Built-in Checks (21 Total)

### Security Context
- SSH enabled
- Telnet disabled
- SNMP public community absent (not "public", "private", "default")
- AAA local configured
- NTP configured

### BGP Context
- BGP peer description present
- BGP import policy exists (if policy name given)
- BGP export policy exists (if policy name given)
- Route-policy referenced exists
- Prefix-list referenced exists
- Community-filter referenced exists
- BGP peer status (establishment, prefix counts)
- BGP session uptime minimum (1hr, 1day, 1week)

### Interface Context
- Interface description present
- Dot1q subinterface MTU consistency
- QinQ interface tags validity

### L2VPN Context
- L2VC status (not down/partial)
- VSI status (not down/partial)
- Duplicate VC/service IDs

### VRF Context
- VRF RD present
- VRF RT import present
- VRF RT export present

### NTP Context
- NTP servers configured
- NTP authentication (if required)

## APIs

### Create/Execute Compliance Job
```
POST /api/compliance-jobs

Body:
{
  "deviceId": 123,
  "contexts": ["bgp", "interface", "security"],
  "policyProfileName": "huawei-vrp-edge-strict"
}

Response: { id, status: "pending", createdAt }
```

### List Findings
```
GET /api/compliance-findings?status=fail&severity=error&context=bgp&freshness=current

Query params:
- status: pass, fail, warning, unknown
- severity: error, warning, info
- context: bgp, interface, security, vrf, l2vpn, ntp
- confidence: high, medium, low
- source: snapshot, config, fallback
- operationalCategory: BLOCKER_REAL, RISCO_OPERACIONAL, PADRONIZACAO, etc.
- freshness: current, stale, legacy, superseded
- actionableOnly: true (exclude ignored)
- latestJobOnly: true (from last run per device)
- deviceId: 123

Response: [{ id, policyName, severity, result, message, recommendation, evidence, objectName }]
```

### Device Compliance Summary
```
GET /api/devices/:id/compliance

Response:
{
  "deviceId": 123,
  "profileName": "huawei-vrp-edge-strict",
  "latestJob": { status, completedAt, passCount, failCount },
  "findings": [{ policyName, result, severity, operationalCategory }],
  "freshness": { current: 10, stale: 2, legacy: 0 }
}
```

### Export Report
```
GET /api/compliance/jobs/:id/report/download?format=markdown&status=fail

Query params:
- format: markdown, json, csv
- status: filter by result (optional)
- actionableOnly: exclude ignored (optional)

Returns: Downloaded file with sanitized secrets
```

### Grouped Findings
```
GET /api/compliance-findings-groups?groupBy=rule&severity=error

Query params:
- groupBy: rule, severity, context, operationalCategory
- actionableOnly: true

Response: [{ groupKey, count, findings: [...] }]
```

## Operational Categories

| Category | Meaning | Example |
|----------|---------|---------|
| BLOCKER_REAL | Blocks actual operations | Interface down, BGP session down |
| RISCO_OPERACIONAL | Risk to operations | Missing BGP import policy could cause blackhole |
| PADRONIZACAO | Standardization/naming | Interface without description |
| CUSTOMIZACAO | Non-standard config | Custom VRF naming convention |
| INFORMATIVO | Informational only | BGP uptime < 1hr |
| FALSO_POSITIVO | Known false positive | Policy found via alternative lookup |

## Freshness States

| State | Meaning |
|-------|---------|
| current | Latest job (< 7 days old) |
| stale | Old job (7-30 days) |
| legacy | Very old job (> 30 days) |
| superseded | Newer job exists, this is historical |

## Confidence Scoring

**Source confidence:**
- `high`: Data from collected config (SSH backup)
- `medium`: Data from device snapshot (SNMP/API)
- `low`: Fallback/indirect evidence

**Scoring:** Source + data age + check certainty

## Report Sanitization

**Data masked in exports:**
- Passwords, community strings, pre-shared keys
- IP addresses (PII) → redacted
- Interface IPs → redacted
- Credentials in command outputs → [REDACTED]

**Example:**
```
BGP neighbor 10.10.1.1: FAILING
  Reason: community string is "public"
  (Exported as: community string is "[REDACTED]")
```

## Audit Trail

**All operations logged:**
- `compliance_policy_created/updated/deleted`
- `compliance_profile_created/updated`
- `compliance_create` (job created)
- `compliance_execute` (job run)
- `compliance_report_download`
- `compliance_findings_export`

**Query audit:**
```
GET /api/audit-logs?action=compliance_create&objectType=compliance_job
```

## UI Workflow

### Compliance Dashboard
1. Click "Compliance" in main nav
2. Select device from dropdown
3. Click "Create Job" button
4. Choose profile (strict/balanced/observe-only)
5. Select contexts (bgp, interface, security, etc.)
6. Click "Run Compliance"
7. View results:
   - Summary cards (pass/fail/warning counts by context)
   - Finding groups table
   - Severity badge coloring
   - Drill-down to full finding detail + evidence

### Finding Detail
- Policy name + description
- Severity + operational category
- Result (pass/fail/warning/unknown)
- Evidence (config excerpt, sanitized)
- Recommendation (how to fix)
- Object name (peer-10.10.1.1, interface-ge0/0/1, etc.)
- Source (snapshot, config, fallback)
- Confidence (high/medium/low)

### Report Export
1. Open job detail
2. Click "Download Report"
3. Choose format (Markdown, JSON, CSV)
4. Choose filters (status, severity, context)
5. Download starts (browser)

## Performance

| Operation | Expected Duration |
|-----------|---|
| Run job (50 device contexts) | < 5 seconds |
| List findings (10k rows) | < 500 ms |
| Export report (1000 findings) | < 1 second |
| Grouped findings query | < 200 ms |

## Extensibility

### Adding New Checks
1. Add function to `/modules/compliance/checks/<context>-checks.ts`
2. Return `StructuredFinding[]`
3. Add policy definition (migration or API)

### Adding New Profile
1. Migration with profile definition + rule overrides
2. Or: `POST /api/compliance-policy-profiles` (runtime)

### Adding New Operational Category
1. Update enum in `compliance-finding.ts` schema
2. Update engine categorization logic

## References

- [Compliance Engine V2](./COMPLIANCE_ENGINE_V2.md) — Design & snapshot-based checks
- [Source & Confidence](./COMPLIANCE_SOURCE_CONFIDENCE.md) — Scoring methodology
- [Profile Assignment](./COMPLIANCE_PROFILE_ASSIGNMENT.md) — Device-to-profile logic
- [Report Export](./COMPLIANCE_REPORT_EXPORT.md) — Format & sanitization
