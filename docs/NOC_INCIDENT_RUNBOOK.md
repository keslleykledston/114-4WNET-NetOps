# NOC Incident Runbook

**Version:** v0.3.4  
**Scope:** Common incidents, troubleshooting, escalation  
**Updated:** 2026-05-22

---

## Incident Categories

1. [Connectivity Issues](#connectivity-issues)
2. [Discovery & Collection Failures](#discovery--collection-failures)
3. [BGP & Routing Issues](#bgp--routing-issues)
4. [Compliance & Findings](#compliance--findings)
5. [Export & Download Failures](#export--download-failures)
6. [Permission & Access Issues](#permission--access-issues)
7. [Performance & Timeouts](#performance--timeouts)

---

## Connectivity Issues

### Symptom: "SSH Failed" or "SSH Timeout"

**Detection:**
- Device detail shows "SSH unreachable"
- Test Connectivity button returns error
- Discovery job times out

**Diagnostic Steps:**

1. [ ] Check device credentials in UI (Device detail → Edit)
   - [ ] Hostname/IP correct?
   - [ ] SSH port correct (default 22)?
   - [ ] Username not empty?
2. [ ] Test SSH manually:
   ```bash
   ssh -u <username> <hostname>:<port>
   # Expected: login prompt or remote shell
   ```
3. [ ] Check network connectivity:
   ```bash
   ping <hostname>
   traceroute <hostname>
   ```
4. [ ] Check firewall/ACL:
   - [ ] Device admin confirmed SSH allowed
   - [ ] No upstream firewall blocking
   - [ ] VPN active if remote (check split-tunnel)
5. [ ] Check device logs (if accessible via NOC terminal):
   - [ ] Auth failures in device syslog?
   - [ ] SSH service running?
   - [ ] Max sessions exceeded?

**Resolution:**

| Diagnosis | Action |
|-----------|--------|
| Bad credentials | Update device record, re-test |
| SSH service down | Escalate to device admin, request restart |
| Network unreachable | Check routing, VPN, firewall rules |
| SSH keys expired | Rotate keys with device admin |
| Max sessions reached | Clear old sessions on device, retry |

**Escalation:** If unresolved after 15 min → page on-call Network Engineer

---

### Symptom: "SNMP Timeout"

**Detection:**
- Device shows "SNMP unreachable"
- Interface counts not populated
- No interface stats

**Diagnostic Steps:**

1. [ ] Verify SNMP is enabled on device
2. [ ] Check community string (Device detail):
   - [ ] Is it a read-only community?
   - [ ] Matches device config?
3. [ ] Test SNMP manually:
   ```bash
   snmpget -c <community> -v 2c <hostname> 1.3.6.1.2.1.1.1.0
   # Expected: system description
   ```
4. [ ] Check SNMP ACL on device (via SSH):
   ```
   display snmp community  # or equivalent
   ```
5. [ ] Verify UDP 161 open (firewall)

**Resolution:**

| Diagnosis | Action |
|-----------|--------|
| Community mismatch | Update in device record |
| SNMP disabled | Enable on device, update record |
| ACL blocks source | Device admin adjusts ACL |
| Firewall blocks UDP | Network team opens port |

**Escalation:** If unresolved → escalate to Network Engineer + Device Admin

---

## Discovery & Collection Failures

### Symptom: "Discovery Hangs" (exceeds 10 min)

**Detection:**
- Discovery job running for > 10 min
- No status updates in UI

**Diagnostic Steps:**

1. [ ] Check API logs for device:
   ```bash
   docker logs netops-api | grep discovery | tail -20
   ```
2. [ ] Check if SSH connection stuck:
   - [ ] SSH session count on device high?
   - [ ] Device CPU/memory usage high?
3. [ ] Check which command is hanging:
   - [ ] `display interface` (lots of interfaces)?
   - [ ] `display bgp routing-table` (huge table)?
   - [ ] Custom command timing out?
4. [ ] Stop discovery job (check if UI supports cancel)

**Resolution:**

| Diagnosis | Action |
|-----------|--------|
| Device too slow | Increase timeout (engineering), re-run |
| Command hanging | Whitelist different command variant |
| Device CPU high | Contact device admin, retry later |
| SSH session limit | Reduce parallel discovery jobs |

**Escalation:** If repeats → engineering tuning required

---

### Symptom: "Discovery Partial" (some data missing)

**Detection:**
- Discovery completes but some sections empty:
  - Interfaces count = 0
  - BGP peers = empty
  - VLANs = empty

**Diagnostic Steps:**

1. [ ] Check discovery log for warnings:
   - [ ] Did command execute?
   - [ ] Was output parsing it correctly?
2. [ ] Compare to manual SSH check:
   ```bash
   ssh <device> "display interface | include Ethernet"
   # Compare count to UI
   ```
3. [ ] Check if data type unsupported:
   - [ ] Device vendor/platform supported?
   - [ ] Commands whitelisted?
4. [ ] Review parser logs (engineering):
   - [ ] Any "skipped" entries?
   - [ ] Unrecognized format?

**Resolution:**

| Diagnosis | Action |
|-----------|--------|
| Unsupported command | Engineering adds parser |
| Parsing bug | Engineering fixes, re-run discovery |
| Device returns no data | Confirm with device admin (feature disabled?) |
| Whitelist missing | Engineering adds command to allowlist |

**Escalation:** Engineering → parser enhancement / allowlist update

---

## BGP & Routing Issues

### Symptom: "BGP Peer Not Found" or "No Routes"

**Detection:**
- BGP section shows no peers
- Route query returns empty

**Diagnostic Steps:**

1. [ ] Verify device is routing device:
   - [ ] Device role = RX/provider/ix?
   - [ ] BGP enabled (`display bgp summary`)?
2. [ ] Manual check:
   ```bash
   ssh <device> "display bgp summary"
   ```
3. [ ] Check if peers in specific VRF:
   - [ ] Global VRF queried?
   - [ ] Customer VPN instances exist?
   - [ ] Discovery captured them?
4. [ ] Check if routes collected:
   ```bash
   ssh <device> "display bgp routing-table summary"
   ```

**Resolution:**

| Diagnosis | Action |
|-----------|--------|
| BGP disabled | Enable BGP on device, re-run discovery |
| Routes in VRF | Update discovery to include VRF |
| Peers down | Expected if peer offline; document |
| Parser issue | Engineering fixes route parser |

**Escalation:** If data present but not collected → engineering

---

### Symptom: "Route Query Timeout" (>30 sec)

**Detection:**
- Click "Prefixes" button, waits > 30 sec
- Error: "Query timeout"

**Diagnostic Steps:**

1. [ ] Check route count first:
   - [ ] Discovery says "received_routes" = ?
   - [ ] If > 50,000 routes → expected to be slow
2. [ ] Check if peer is flapping:
   - [ ] Peer status stable?
   - [ ] Route churn happening?
3. [ ] Check device load:
   - [ ] CPU, memory OK?
   - [ ] Other processes running?

**Resolution:**

| Diagnosis | Action |
|-----------|--------|
| > 10k routes | Expected timeout, increase limit or filter |
| Device overloaded | Contact device admin, retry later |
| Peer unstable | Wait for convergence, retry |
| Command timeout too short | Engineering increases timeout |

**Workaround:** Use CSV export of findings instead of live query

**Escalation:** If repeats → engineering timeout tuning

---

## Compliance & Findings

### Symptom: "Compliance Job Stuck" or "No Findings Generated"

**Detection:**
- Compliance job running but not progressing
- Job completes but findings = 0

**Diagnostic Steps:**

1. [ ] Check device config was collected:
   - [ ] Device has recent discovery run?
   - [ ] Config length > 0?
2. [ ] Check profile applied:
   - [ ] Selected profile supports vendor/platform?
   - [ ] Rules exist for this device role?
3. [ ] Check logs for errors:
   ```bash
   docker logs netops-api | grep compliance | tail -30
   ```
4. [ ] Manual check: run simple rule:
   ```bash
   # Verify device config is available
   curl -s http://localhost:8085/api/devices/<id>/config \
     -H "Cookie: session=..." | jq '.config' | head -50
   ```

**Resolution:**

| Diagnosis | Action |
|-----------|--------|
| No recent discovery | Run discovery first, then compliance |
| Profile unsupported | Switch to different profile |
| No applicable rules | Expected (find different device/profile combo) |
| Compliance engine error | Engineering debug + fix |

**Escalation:** If engine error → engineering

---

### Symptom: "Critical Finding Appears Stale/Old"

**Detection:**
- Finding shows "freshness": "stale"
- Evidence timestamp old (days/weeks)

**Diagnostic Steps:**

1. [ ] Check when finding was created:
   - [ ] Is evidence timestamp > 24h old?
   - [ ] Is device config outdated?
2. [ ] Re-run discovery on device:
   - [ ] Does fresh run clear the finding?
   - [ ] Or does finding persist (real issue)?
3. [ ] Check if config actually changed:
   - [ ] SSH to device, manual check
   - [ ] Confirm in device

**Resolution:**

| Diagnosis | Action |
|-----------|--------|
| Device config unchanged | Finding is real, don't ignore |
| Device config fixed | Re-run discovery to refresh evidence |
| Stale snapshot | Update discovery schedule |

**Note:** "Stale" finding = evidence old but finding still real. Re-validate before closing.

---

### Symptom: "False Positive Finding"

**Detection:**
- Finding appears but manually verified as OK
- Policy exception applies (temporary)

**Actions:**

1. [ ] Document reason for false positive:
   - [ ] Change request exemption?
   - [ ] Known device limitation?
   - [ ] Policy too strict?
2. [ ] Options:
   - [ ] Acknowledge finding (mark "reviewed")
   - [ ] Request policy tune (engineering)
   - [ ] Create exception rule (future feature)
3. [ ] Track in ticket system
4. [ ] Set reminder to revisit after CR closes

---

## Export & Download Failures

### Symptom: "Report Download Returns 404"

**Detection:**
- Click Download button, error 404
- Browser shows: `Job not found`

**Diagnostic Steps:**

1. [ ] Verify job still exists:
   - [ ] Refresh page, job still visible?
   - [ ] Job status = "completed"?
2. [ ] Check permissions:
   - [ ] User has `compliance.export` permission?
   - [ ] User role = operator/admin?
3. [ ] Check browser logs (F12):
   - [ ] Actual error message?

**Resolution:**

| Diagnosis | Action |
|-----------|--------|
| Job deleted | Run new compliance job, try again |
| Permission missing | Admin grants compliance.export |
| Session expired | Logout/login again |

---

### Symptom: "Report Download Returns 500"

**Detection:**
- Download button returns error 500
- File appears partially corrupted

**Diagnostic Steps:**

1. [ ] Check API logs:
   ```bash
   docker logs netops-api | grep compliance_report | tail -20
   ```
2. [ ] Try different format:
   - [ ] Markdown failing? Try JSON
   - [ ] CSV failing? Try JSON
3. [ ] Try without filters (if using URL filters)

**Resolution:**

| Diagnosis | Action |
|-----------|--------|
| Memory error (large job) | Filter findings, try again |
| Encoding issue | Engineering bug fix needed |
| Database timeout | Retry after 30 sec |

**Escalation:** If persists → engineering debug

---

## Permission & Access Issues

### Symptom: "You don't have permission to access this"

**Detection:**
- Click on device/compliance/scheduler → 403 Forbidden
- Error: "Permission denied: devices.read" (or similar)

**Resolution:**

| Permission | Who Grants | Fix |
|-----------|-----------|-----|
| devices.read | admin | Request operator+ role |
| compliance.export | admin | Admin grants permission |
| device.configure | admin | Not granted to operator (security) |

**Actions:**

1. [ ] Check user role (top-right menu)
2. [ ] Request admin to upgrade role or permission
3. [ ] Relogin after permission change

---

## Performance & Timeouts

### Symptom: "Page Loading Slowly" or "Discovery Takes Hours"

**Detection:**
- Device list takes > 5 sec to load
- Discovery runs > 30 min

**Diagnostic Steps:**

1. [ ] Check browser performance (F12 → Network):
   - [ ] API calls slow or stuck?
   - [ ] Download size large?
2. [ ] Check API logs:
   - [ ] Database queries slow?
   - [ ] SSH connections slow?
3. [ ] Check device count:
   - [ ] > 1000 devices? Expected slow
   - [ ] Filter by site to narrow
4. [ ] Check network:
   - [ ] Latency to API high?
   - [ ] Bandwidth congested?

**Resolution:**

| Cause | Action |
|------|--------|
| Large dataset | Use filters (by site, role, status) |
| Slow API | Engineering optimize queries |
| Slow SSH device | Increase timeout, run off-hours |
| Network latency | Check connectivity, VPN |

**Escalation:** If optimization needed → engineering

---

## Escalation Matrix

| Severity | Response | Owner | Escalation Path |
|----------|----------|-------|-----------------|
| **Critical** | Immediate | On-call Eng | Slack #alerts → page oncall |
| **High** | < 1 hour | NOC Lead | Daily standup, create ticket |
| **Medium** | < 4 hours | NOC | Week planning, assign ticket |
| **Low** | < 1 day | NOC | Backlog, groom next sprint |

---

## Common Resolution Paths

### Restart API (Last Resort)

```bash
docker restart netops-api
# Wait 30 sec for readiness
curl http://localhost:8085/api/healthz
```

**Use only if:**
- Logs show crash/OOM
- Unresponsive for > 5 min
- Engineering approval

### Clear Cache (Browser)

```bash
cmd/ctrl + shift + delete  # Chrome
cmd/shift + delete         # Firefox
```

**Use if:**
- Page not updating
- Buttons not responding
- After permission change

---

## Contacts & Escalation

| Role | Name | Slack | Phone |
|------|------|-------|-------|
| NOC Lead | @on-duty-lead | Slack | (555) NOC-LEAD |
| Network Eng | @network-eng | #netops-eng | (555) NET-ENG |
| DB Admin | @dba | #databases | (555) DBA |
| Product | @product-owner | #netops-product | Slack DM |

---

**Last Updated:** 2026-05-22  
**Next Review:** 2026-06-22  
**Version:** v0.3.4
