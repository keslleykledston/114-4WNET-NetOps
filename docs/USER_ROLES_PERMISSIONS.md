# User Roles Permissions

## Matrix

| Action | viewer | operator | admin |
|---|---:|---:|---:|
| Dashboard / read-only pages | yes | yes | yes |
| List devices | yes | yes | yes |
| Create / edit / delete devices | no | yes | yes |
| Test connectivity | no | yes | yes |
| Discover | no | yes | yes |
| BGP route query | no | yes | yes |
| Compliance execute | no | yes | yes |
| Template render | no | yes | yes |
| Provisioning validate / preview | no | yes | yes |
| Provisioning approve | no | no | yes |
| Integrations update | no | no | yes |
| Users CRUD | no | no | yes |
| Scheduler view | yes | yes | yes |
| Scheduler run now | no | yes | yes |
| Scheduler create / edit / delete | no | no | yes |
| Audit / reports / integrations read | yes | yes | yes |
| Apply real | no | no | no |
| Rollback real | no | no | no |

## Rule

- backend is source of truth
- frontend only hides buttons
- security lives in API middleware
