# Compliance Engine Architecture

## Overview

Compliance Engine evaluates device configurations against predefined policies and generates findings.

**Key Components:**
- `compliance-engine.ts` — orchestrates compliance execution
- `checks/` — domain-specific rule evaluators (BGP, Interface, VRF, L2VPN, Security)
- `compliance-policies` table — rule definitions
- `compliance-jobs` table — execution records
- `compliance-findings` table — results
- `compliance-policy-profiles` table — severity/rule customization per device role

## Rule Types

### Structured Checks
Rules evaluated against device discovery snapshots (parsed configs).

**Examples:**
- BGP peer state (Established), policy presence, prefix-list references
- Interface descriptions, VLAN encapsulation
- VRF RD/RT configuration
- L2VC/VSI state
- Security (SNMP communities, Telnet, SSH)

Confidence derived from snapshot version + parser quality.

### Legacy Regex Checks (deprecated)
Pattern-based searches against raw config text.

**Impact:**
- Low confidence (may have false positives)
- Severity normalized if confidence is low

## Scoring

Score = `max(0, 100 - Σ penalties_for_failed_findings)`

**Penalties by Severity:**
- CRITICAL: 10 points
- HIGH: 8 points
- MEDIUM: 5 points
- WARNING: 3 points
- LOW: 1 point
- INFO: 0 points

**Score Bands:**
- ≥100: PASS
- 80-99: WARNING
- <80: FAIL

Example: 2 CRITICAL failures + 1 MEDIUM failure = `100 - (10+10+5) = 75` (FAIL)

## Profiles

Profiles allow severity overrides per device role/vendor/platform.

**Example:** `huawei-vrp-edge-strict` might elevate interface-description to CRITICAL for production edges.

Fields:
- `name` — unique identifier
- `description` — intent
- `deviceRole` — target device type (optional)
- `vendor` — target vendor (optional)
- `platform` — target platform (optional)
- `rulesJson` — rule customizations (future)
- `thresholdsJson` — severity mappings

## Execution Flow

```
POST /api/compliance/run/device/:id
│
├─ Create compliance_job (status=pending)
│
├─ executeComplianceJob(jobId)
│  ├─ Load device + latest discovery snapshot + collected config
│  ├─ Load policy profile (default: huawei-vrp-edge-balanced)
│  ├─ Run structured checks
│  │  ├─ runSecurityChecks()
│  │  ├─ runInterfaceChecks()
│  │  ├─ runBgpChecks()
│  │  ├─ runVrfChecks()
│  │  └─ runL2vpnChecks()
│  ├─ Run legacy regex checks (if enabled)
│  ├─ Normalize severity based on confidence
│  ├─ Apply profile severity overrides
│  ├─ Insert findings into compliance_findings
│  └─ Update job status (passed/failed)
│
└─ Return job summary
```

## Contexts

Compliance jobs can be scoped to specific contexts (optional all):

- `security` — SNMP, Telnet, SSH, AAA
- `ntp` — NTP configuration
- `snmp` — SNMP setup
- `interface` — Interface descriptions, encapsulation
- `bgp` — BGP peer state, policies, prefix lists
- `l3vpn` — VRF RD/RT
- `l2vpn` — L2VC, VSI

## Policy Profiles (Built-in)

### huawei-vrp-edge-balanced (default)
For typical Huawei edge routers. No severity overrides.

### huawei-vrp-edge-strict
Stricter. Interface descriptions = CRITICAL.

### huawei-vrp-observe-only
Informational only. All findings = INFO severity.

## Adding New Rules

1. **Define rule in `compliancePoliciesTable`:**
   ```sql
   INSERT INTO compliance_policies (name, context, severity, rule_type, rule_pattern, vendor, enabled)
   VALUES ('My Rule', 'bgp', 'high', 'structured', 'my-rule-key', 'huawei', true);
   ```

2. **Add check function in `checks/` module:**
   ```ts
   export function checkMyFeature(ctx: ComplianceContext): StructuredFinding[] {
     if (!ctx.snapshot) return [];
     const findings: StructuredFinding[] = [];
     // Evaluate and push findings
     return findings;
   }
   ```

3. **Register in `compliance-engine.ts` → `executeComplianceJob()`:**
   ```ts
   if (isRequested(ctx.contexts, ["my-context"])) {
     findings.push(...checkMyFeature(ctx));
   }
   ```

4. **Test via selftest:**
   ```bash
   node tools/compliance-engine-selftest.mjs
   ```

## APIs

**Trigger:**
```http
POST /api/compliance/run/device/:id
POST /api/compliance/run/site/:siteName
```

**Query:**
```http
GET /api/compliance-jobs
GET /api/compliance-jobs/:id
GET /api/compliance-findings
GET /api/compliance-dashboard
GET /api/devices/:id/compliance
```

**Management:**
```http
GET /api/compliance-policies
POST /api/compliance-policies
PATCH /api/compliance-policies/:id
GET /api/compliance-policy-profiles
POST /api/compliance-policy-profiles
PATCH /api/compliance-policy-profiles/:name
```
