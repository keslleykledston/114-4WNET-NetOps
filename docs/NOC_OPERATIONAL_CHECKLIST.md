# NOC Operational Checklist

**Version:** v0.3.4  
**Audience:** Network Operations Center (NOC) staff  
**Updated:** 2026-05-22

---

## Pre-Shift Checklist

### Authentication & Access (5 min)

- [ ] Open NetOps Manager at `http://netops.internal/` (or localhost:3005 in dev)
- [ ] Login with NOC operator credentials (email + password)
- [ ] Verify role shows "operator" or "admin" (top-right user menu)
- [ ] Check that you can navigate to:
  - [ ] Devices page
  - [ ] Compliance page
  - [ ] Scheduler page
  - [ ] Audit Logs page
- [ ] If access denied on any page → escalate to admin

### System Health (5 min)

- [ ] Check API health: `curl -fsS http://localhost:8085/api/healthz`
- [ ] Expected response: `{"status":"ok"}`
- [ ] Check frontend loads: `http://localhost:3005/devices` (should render, no 404)
- [ ] Check recent audit logs → verify system activity is flowing
- [ ] If any health check fails → restart docker compose or escalate

---

## Daily Operations Workflow

### 1. Device Status Review (10 min)

**Location:** Devices page → `/devices`

- [ ] Navigate to Devices
- [ ] Scan list for red/orange status indicators
- [ ] Count: active (✓), unreachable (✗), unknown (?)
- [ ] If > 2 devices unreachable → investigate (see Runbook)
- [ ] Note any new devices (should be < 5 per day)

### 2. SSH Connectivity Test (5 min per device)

**Location:** Device detail → "Test Connectivity" button

For each critical device:
- [ ] Open device detail (click hostname)
- [ ] Click "Test Connectivity" button
- [ ] Wait for status (expected: "SSH OK" or "SNMP OK")
- [ ] If failed: check credentials, SSH access, firewall
- [ ] Document result in incident log if failed

### 3. Discovery Refresh (15 min)

**Location:** Device detail → "Start Discovery" button

On each shift or when investigating:
- [ ] Open device detail
- [ ] Click "Start Discovery"
- [ ] Wait for job to complete (2-5 min per device)
- [ ] Check result:
  - [ ] Interfaces parsed correctly (count matches physical)
  - [ ] BGP peers visible (if applicable)
  - [ ] VLANs detected
- [ ] If discovery fails/hangs → check logs, escalate

### 4. BGP Peer Inspection (If Applicable)

**Location:** Device detail → "BGP" section

For routing devices (role = RX/provider/ix):
- [ ] Expand BGP Peers section
- [ ] Scan for peer status (admin state, neighbor up/down)
- [ ] Check route counts (received/advertised)
- [ ] Click "Prefixes" button on critical peers
- [ ] Review received/advertised routes
- [ ] Alert if:
  - [ ] Peer down unexpectedly
  - [ ] Route count spike (2x+ increase)
  - [ ] AS-PATH invalid (missing hops)

### 5. Compliance Scan (10 min)

**Location:** Compliance page → `/compliance`

Trigger scan:
- [ ] Click "Run Compliance" on Compliance page
- [ ] Select device or device group
- [ ] Select profile (default: "balanced")
- [ ] Click "Start Job"
- [ ] Wait for completion (2-10 min depending on device count)

Review findings:
- [ ] Check "Actionable Only" filter to see only failures
- [ ] Sort by severity → Critical, High, Medium, Low
- [ ] Review critical findings (require attention today)
- [ ] Review high findings (plan remediation)
- [ ] Acknowledge low findings (informational)

### 6. Download Compliance Report (5 min)

**Location:** Compliance page → Jobs table → Download icon

For each completed job:
- [ ] Click Download icon (right side of job row)
- [ ] Browser downloads `compliance-job-{id}-{date}.md`
- [ ] Open in text editor or markdown viewer
- [ ] Review:
  - [ ] Summary section (total findings, pass/fail counts)
  - [ ] Top issues (by severity, by context)
  - [ ] Evidence (sanitized, no secrets should be visible)
- [ ] If issues found → document in ticket system

**Alternative formats:**
- [ ] JSON export: change URL `?format=json` (structured data)
- [ ] CSV export: change URL `?format=csv` (spreadsheet)

### 7. Audit Log Review (5 min)

**Location:** Audit Logs page → `/audit-logs`

Daily audit verification:
- [ ] Filter by date (today)
- [ ] Check that key actions are logged:
  - [ ] test_connectivity events
  - [ ] device_discovery_start/complete
  - [ ] compliance_job_run
  - [ ] compliance_report_download
- [ ] Check no error events (red)
- [ ] Document any suspicious activity
- [ ] If gaps in logging → escalate

### 8. Scheduler Status (5 min)

**Location:** Scheduler page → `/scheduler`

Check automated jobs:
- [ ] Navigate to Scheduler
- [ ] Verify daily discovery job ran successfully
- [ ] Verify nightly compliance job ran successfully
- [ ] Check recent runs (last 24h)
- [ ] If a job failed → check logs, rerun manually if safe

---

## Incident Response Workflow

### Alert Received: BGP Peer Down

1. [ ] Open device detail for affected router
2. [ ] Expand BGP section
3. [ ] Confirm peer status = down
4. [ ] Check when peer went down (last discovery timestamp)
5. [ ] Verify route count before/after (check audit log)
6. [ ] Escalate to on-call engineer if critical peer

### Alert Received: Compliance Critical Finding

1. [ ] Open Compliance page
2. [ ] Filter by severity = critical
3. [ ] Click finding to expand
4. [ ] Read rule name, message, recommendation
5. [ ] Check if it's real (not a false positive / legacy finding)
6. [ ] If real + actionable → create ticket
7. [ ] If legacy → mark as acknowledged, document reason

### Device Unreachable

1. [ ] Open device detail
2. [ ] Click "Test Connectivity"
3. [ ] Check error message (SSH timeout, auth failed, etc.)
4. [ ] If SSH timeout → check network route, firewall, device power
5. [ ] If auth failed → verify credentials in device detail
6. [ ] If persistent → escalate to device admin

---

## Data Export Workflow

### Export All Findings (for external SIEM/reporting)

**Location:** Compliance page → "Export Findings" button

- [ ] Click "Export Findings"
- [ ] Choose format (CSV for spreadsheet, JSON for API)
- [ ] Browser downloads file
- [ ] Import into external system (Splunk, ServiceNow, etc.)
- [ ] Verify record counts match UI

### Export Device List (for inventory sync)

**Location:** Devices page → "Export Devices" button

- [ ] Click "Export Devices"
- [ ] Choose format (CSV or JSON)
- [ ] Browser downloads file
- [ ] Document export date/time
- [ ] Send to inventory team if needed

---

## End-of-Shift Checklist

- [ ] All incidents logged/ticketed
- [ ] No devices left in "unknown" status (investigate or document)
- [ ] All compliance reports reviewed
- [ ] Handoff notes in team channel (critical issues, PRs needed)
- [ ] Logout (click user menu → Logout)

---

## Emergency Contacts

| Role | Contact | Availability |
|------|---------|--------------|
| NOC Lead | on-duty | 24/7 |
| Network Engineer | on-call | escalation |
| Database Admin | on-call | DB issues |
| Product Owner | business hours | design decisions |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `?` | Help (in-app) |
| `g` then `d` | Go to Devices |
| `g` then `c` | Go to Compliance |
| `cmd/ctrl + k` | Search devices |
| `esc` | Close modal |

---

## Common Issues & Quick Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "Permission denied" | Wrong role | Check user role, request operator+ access |
| Page won't load | Browser cache | `cmd/ctrl + shift + r` (hard refresh) |
| SSH timeout | Network/firewall | Ping device, check route, verify VPN |
| Compliance hangs | Device too large | Check device logs, restart discovery |
| Report won't download | Browser popup blocker | Check browser settings, allow downloads |

---

**Last Updated:** 2026-05-22  
**Next Review:** 2026-06-22  
**Status:** ✅ Operational
