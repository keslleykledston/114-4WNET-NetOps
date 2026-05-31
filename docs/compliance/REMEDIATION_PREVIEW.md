# Remediation Preview — FASE v0.9.0

## Overview

Remediation Preview generates CLI configuration suggestions for failing compliance checks.

**IMPORTANT:** Preview only — never executes. No auto-remediation in v0.9.0.

## Purpose

Help operators quickly understand what configuration is needed to fix compliance violations.

**Not a solution:**
- Does not validate syntax
- Does not test changes
- Does not execute automatically
- Suggestions may need adjustment for environment

## Mapping

Remediation rules are keyed by `ruleId` from compliance findings.

**Examples:**

| ruleId | Finding | Suggestion |
|--------|---------|-----------|
| huawei-interface-active-description | Interface lacking description | `interface <name>\n description <description>` |
| huawei-bgp-customer-import-policy | BGP customer missing import policy | `peer <ip> route-policy <policy> import` |
| huawei-vrf-rd | VRF missing RD | `ip vpn-instance <vrf>\n route-distinguisher <rd>` |
| huawei-security-snmp-public-absent | SNMP public community present | `undo snmp-agent community read public` |

## Implementation

**File:** `remediation-preview.service.ts`

```ts
export function generateRemediationPreview(finding: {
  ruleId: string;
  objectName?: string;
  severity: string;
  message: string;
}): RemediationSuggestion | null
```

**Returns:**
```ts
interface RemediationSuggestion {
  ruleId: string;
  title: string;
  cliSuggestion: string;
  explanation: string;
  severity: string;
}
```

**Returns `null` if no template exists for ruleId.**

### Object Extraction

Automatically extracts object names from finding message:

```ts
const peerMatch = message.match(/peer\s+([\d\.]+)/i);  // → IP
const interfaceMatch = message.match(/interface\s+(\S+)/i);  // → name
const vrfMatch = message.match(/vrf\s+(\S+)/i);  // → VRF name
```

Substitutes into template: `peer 10.0.0.1 route-policy IMPORT import`

## Adding New Templates

Edit `REMEDIATION_TEMPLATES` in `remediation-preview.service.ts`:

```ts
"my-new-rule": (objectName) => ({
  ruleId: "my-new-rule",
  title: "My Rule Title",
  cliSuggestion: objectName
    ? `my-command ${objectName} option value`
    : "my-command <object> option value",
  explanation: "Why this matters and what it does.",
  severity: "medium",
}),
```

**Rules:**
- Template is a function (receives `objectName`)
- Return `RemediationSuggestion` or throw (caught silently)
- `cliSuggestion` should include placeholders if `objectName` unavailable
- `explanation` is user-facing — be clear and concise

## APIs

**Single finding:**
```http
GET /api/devices/:id/compliance
```

Response includes `remediations[]`:
```json
{
  "remediations": [
    {
      "finding": { "id": 123, "ruleId": "...", ... },
      "remediation": {
        "ruleId": "huawei-interface-active-description",
        "title": "Interface Missing Description",
        "cliSuggestion": "interface Eth0/0\n description PORT_DESCRIPTION",
        "explanation": "Active interfaces must have a description...",
        "severity": "medium"
      }
    }
  ]
}
```

## Usage

1. **Operator views compliance tab on device detail**
2. **For each failing check, displays remediation suggestion**
3. **Operator manually applies config** or copies suggestion to CLI
4. **Re-runs compliance to verify fix**

## Limitations

- No syntax validation
- No environment customization (e.g., port numbers, VRF names)
- Simple pattern matching (may not work for complex configs)
- Multi-step fixes collapsed into single suggestion

## Future Enhancements

- Syntax validation (Huawei VRP grammar)
- Environment-aware substitution (pull device context)
- Multi-step wizards (complex features like BGP communities)
- AI-powered suggestions (based on similar devices)
- Integration with config staging (dry-run before apply)

## No Auto-Execution

**Explicit decision:** Operators always review and approve.

Risks of auto-remediation:
- Network outages from wrong config
- Loss of management connectivity
- Unintended side effects
- Audit trail/compliance requirements

Config changes require:
1. Human review
2. Manual entry or staged apply
3. Validation before commit
4. Audit logging
