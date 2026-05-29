# Phase 4 — Device Integration (planned)

- Require `devices.connector_id` for remote collect
- Route L2 refresh, SNMP_FAST, SSH discovery through connector jobs
- NetOps Server stores results only; no direct `ssh2` to customer IPs from server when `connector_id` is set
