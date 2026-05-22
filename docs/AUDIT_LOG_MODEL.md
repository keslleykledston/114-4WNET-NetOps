# Audit Log Model

## Table

`audit_logs`

## Fields

- `id`
- `actor_id`
- `action`
- `object_type`
- `object_id`
- `metadata_json`
- `source_ip`
- `created_at`

## Rules

- sanitize metadata before persistence.
- do not store password, token, or SNMP community.
- summarize large outputs instead of storing raw payloads.

