# Rule Overrides — FASE v0.9.1

## Quick Start

1. Navigate to `/compliance` → Rules tab
2. Toggle `enabled` checkbox to enable/disable rule
3. Click edit to override severity

## Baseline vs Direct Override

**Direct**: Toggle enable/disable in Rules tab → updates compliance_policies immediately
**Baseline**: Create baseline with ruleJson overrides → applies per-scope without modifying rules

Recommendation: Use **Baselines** for site/vendor variations, **Direct** for simple enable/disable.

## When to Override

- **Disable**: Rule causes false positives, or exemption approved
- **Increase severity**: Critical rule for your environment
- **Decrease severity**: Informational rule, low priority

## Scope Resolution

When running compliance:
1. Load enabled rules from `compliance_policies`
2. Load effective rules via `resolveEffectiveRules(deviceId, vendor, site)`
3. Apply in precedence: DEVICE > VENDOR > SITE > GLOBAL
4. Severity override from baseline replaces rule severity

Example execution:
```
Device 10 in PROD-DC site, vendor=huawei
- GLOBAL: rule X disabled → SKIP
- SITE (PROD-DC): rule X enabled, severity=critical
- Result: APPLY with severity CRITICAL (SITE override)
```

## APIs

**Rules:**
```
GET  /api/compliance/rules              — List all
PUT  /api/compliance/rules/:id          — Update (enable/disable/severity)
```

**Baselines (scope-based):**
```
GET  /api/compliance/baselines          — List all
POST /api/compliance/baselines          — Create
PUT  /api/compliance/baselines/:id      — Update
DELETE /api/compliance/baselines/:id    — Delete
```

## No System Rules

Rules in `compliance_policies` table are NOT marked as "system" — all can be modified. SYSTEM designation is implied by rule naming (e.g., rules prefixed `huawei-` are default policies).

To restore default rules, re-seed via `ensureDefaultPolicies()` in compliance-engine.ts.
