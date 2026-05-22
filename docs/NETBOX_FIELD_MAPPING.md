# NetBox Field Mapping

| NetBox field | Local field | Rule |
|---|---|---|
| `id` | `netbox_device_id` | persisted for future matches |
| `name` | `hostname` | required |
| `primary_ip4.address` or `primary_ip.address` | `ip_address` | mask removed |
| `site.name` | `site` | fallback `unknown` |
| `device_role.name` | `role` | nullable |
| `device_type.manufacturer.name` | `vendor` | fallback `netbox` |
| `platform.name` | `platform` | fallback `netbox` |
| `tenant.id` | future metadata | not persisted yet |
| `status.value` | local status | not used to overwrite connectivity status |
| `comments` / `description` | future metadata | not persisted yet |

## Matching

1. Match by `netbox_device_id`.
2. If missing, match by hostname.
3. If no match and primary IP exists, create local device.
4. If no primary IP and no match, skip.

## Credentials

NetBox sync never imports credentials.

New devices created from NetBox get empty local placeholder credentials and `status=unknown`.
