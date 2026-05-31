# Provisioning Template Registry — FASE v0.8.1

## Overview

The Template Registry provides a read-only, versioned, and audited view of provisioning templates. It enables operators to:
- Browse and inspect templates
- View version history
- Compare versions via diffs
- Export templates
- Understand template variables and validation rules
- Track access via audit logs

Templates can be from in-memory catalog (PROVISIONING_TEMPLATES — status=SYSTEM) or DB-stored (status=CUSTOM/DRAFT/APPROVED/DEPRECATED).

## Architecture

### Database

Three new tables:
- `provisioning_templates` — main registry with metadata, variables, validation rules, status
- `provisioning_template_versions` — version history
- `provisioning_template_audit_logs` — access/export logs

All tables have uniqueness and foreign key constraints.

### Seeding

On first API request to `GET /api/provisioning/templates`, in-memory `PROVISIONING_TEMPLATES` (9 Huawei VRP templates) are seeded into the DB with:
- `status = SYSTEM`
- `source = in_memory`
- Initial version `1.0.0`

This is idempotent — duplicate names are skipped.

### API Endpoints

All require `provisioning.read` permission.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/provisioning/templates` | List templates with filters (status, vendor) |
| GET | `/api/provisioning/templates/:id` | Get template detail; logs `viewed` audit |
| GET | `/api/provisioning/templates/:id/versions` | List version history |
| GET | `/api/provisioning/templates/:id/diff/:vA/:vB` | Diff two versions (line-by-line) |
| GET | `/api/provisioning/templates/:id/export` | Export as JSON; logs `exported` audit |
| GET | `/api/provisioning/templates/:id/audit` | Get audit logs for this template |

No POST/PUT/PATCH/DELETE endpoints exist in this phase — all read-only.

### Frontend

Two pages:

**`/provisioning/templates`** — list view
- Filterable table by status and vendor
- Columns: Name, Vendor, Service Type, Version, Status badge, Created date
- Click row to navigate to detail

**`/provisioning/templates/:id`** — detail view with 5 tabs
1. **Variables** — parameter schema table (field, type, required, description)
2. **Validation** — pre-check hints, post-check hints, risks
3. **Preview** — template body in `<pre>` (read-only, variables shown as literals)
4. **Versions** — version history + inline diff tool
5. **Audit** — access/export log entries (action, actor, timestamp)

Menu item "Template Registry" in Provisioning section.

## Security

- **No execution**: Template body is never rendered or executed
- **No free form**: Only pre-defined templates are in registry
- **Masked secrets**: `password`, `secret`, `community`, `key` fields masked in preview/export
- **Immutable SYSTEM**: SYSTEM templates have `editable: false` (no write endpoints exist)
- **Audit trail**: All views and exports logged with actor, timestamp, IP
- **Read permission only**: `provisioning.read` suffices (no `admin` required for viewing)

## Status Values

- **SYSTEM** — built-in from in-memory catalog (blue badge)
- **CUSTOM** — user-created (purple)
- **DRAFT** — work-in-progress (gray)
- **APPROVED** — review-passed (green)
- **DEPRECATED** — obsolete (amber)

## Template Structure (in DB)

```json
{
  "id": 1,
  "name": "huawei-vrp-bgp-customer",
  "vendor": "Huawei",
  "service_type": "bgp_peer_customer",
  "version": "1.0.0",
  "status": "SYSTEM",
  "source": "in_memory",
  "variables_json": {
    "bgp_asn": { "type": "integer", "required": true, "description": "ASN" },
    "neighbor_ip": { "type": "string", "required": true, "description": "Peer IP" }
  },
  "validation_rules_json": {
    "risks": [
      "BGP session down until peer configured"
    ],
    "precheckHints": [
      "Verify peer is reachable"
    ],
    "postcheckHints": [
      "Check BGP session state"
    ]
  },
  "template_body": "bgp 65001\n neighbor {{neighbor_ip}} remote-as {{bgp_asn}}\n..."
}
```

## Diff Format

Line-by-line comparison:
```json
[
  { "type": "unchanged", "line": "bgp 65001", "lineNumber": 1 },
  { "type": "removed", "line": "neighbor 10.0.0.1", "lineNumber": 2 },
  { "type": "added", "line": "neighbor 10.0.0.2", "lineNumber": 2 }
]
```

## Future (Post v0.8.1)

- Template Studio with editing
- Version approval workflow
- Template branching/merging
- Custom template creation
- Template testing UI
- Integration with provisioning preview
