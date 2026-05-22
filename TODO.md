# TODO

- Decide whether production deploys use Drizzle `push` or SQL migration files for discovery schema rollout.
- Keep the manifest-first Docker install path and pnpm cache mount; do not regress to whole-workspace preinstall copy.
- Expand route-policy parser coverage for platform-specific Huawei VRP variants.
- Keep `CONFIG_APPLY_ENABLED=false` by default and require explicit approval before any real apply path.
- Expand audit/report UI filters and add export/download flows.
- Move `tools/device-discovery-selftest.mjs` checks into the formal test runner when one is added.
- Wire compliance jobs to discovery confidence warnings.
- Add password reset / disable user / session revoke UX for local RBAC.
- Decide whether `cron_expression` becomes live in the next release or stays metadata only.
- Test v0.2.3 NetBox read-only sync with a real NetBox lab.
- Keep NetBox write-back out of scope until explicit design approval.
