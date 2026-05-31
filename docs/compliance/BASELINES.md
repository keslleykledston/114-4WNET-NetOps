# Compliance Baselines — FASE v0.9.1

## Overview

Baselines allow per-scope rule overrides: enable/disable rules, override severity per GLOBAL/SITE/VENDOR/DEVICE scope.

## Scope Hierarchy

Precedence (highest → lowest):
1. DEVICE (for single device)
2. VENDOR (e.g., "huawei")
3. SITE (e.g., "DC1")
4. GLOBAL (applies to all)

Example: If rule X is `severity: high` in GLOBAL but `severity: warning` in SITE baseline, the SITE override wins for devices in that site.

## Structure

```json
{
  "scopeType": "SITE",
  "scopeId": "DC1",
  "name": "Production Site Baseline",
  "rulesJson": {
    "huawei-interface-active-description": {
      "enabled": false,
      "severityOverride": "info"
    },
    "huawei-bgp-customer-import-policy": {
      "enabled": true
    }
  }
}
```

### Fields

- `scopeType` — GLOBAL | SITE | VENDOR | DEVICE
- `scopeId` — Required for non-GLOBAL (site name, vendor, device_id)
- `rulesJson` — Map of rulePattern → { enabled?, severityOverride? }
  - `enabled: false` → rule skipped
  - `severityOverride: "warning"` → severity replaced

## API

```
GET  /api/compliance/baselines           — List all
POST /api/compliance/baselines           — Create
GET  /api/compliance/baselines/:id       — Get
PUT  /api/compliance/baselines/:id       — Update
DELETE /api/compliance/baselines/:id     — Delete
```

## UI

Baselines tab in `/compliance` page:
- List with scope badge + name + enabled toggle
- Create dialog (scope selector, name, description, rules JSON)
- Edit + delete per baseline

## Example Use Cases

**1. Strict production site:**
```json
{
  "scopeType": "SITE",
  "scopeId": "PROD-DC",
  "rulesJson": {
    "huawei-interface-active-description": { "enabled": true },
    "huawei-security-snmp-public-absent": { "severityOverride": "critical" }
  }
}
```

**2. Lenient test environment:**
```json
{
  "scopeType": "SITE",
  "scopeId": "TEST-LAB",
  "rulesJson": {
    "huawei-bgp-customer-import-policy": { "enabled": false }
  }
}
```

**3. Legacy device exemption:**
```json
{
  "scopeType": "DEVICE",
  "scopeId": "42",
  "rulesJson": {
    "huawei-interface-active-description": { "severityOverride": "low" }
  }
}
```
