# Roadmap

- Apply discovery persistence migration in managed environments and wire it into the deployment process.
- Expand Huawei VRP parsers beyond first-pass route-policy nodes, community-list, VSI and L2VC detail.
- Add live protected route search with mandatory filters and 50-route sample cap.
- Add CI tests once a test runner is introduced for API and frontend packages.
- Expand compliance v2 thresholds and per-customer policy tuning after source/confidence baseline.
- Formalize audit/report retention and export policies.
- Keep provisioning apply locked behind an explicit safety flag until safe allowlisted apply steps are designed and tested.
- Finish RBAC hardening: session expiry policy, password reset flow, and richer permission UI.
- Expand scheduler support later with cron parser and richer run history filters.
- Validate NetBox read-only sync against a real NetBox instance when `NETBOX_URL` and `NETBOX_TOKEN` are available.
- Add dedicated local columns for NetBox tenant/site/role IDs if the next release needs richer inventory lineage.
