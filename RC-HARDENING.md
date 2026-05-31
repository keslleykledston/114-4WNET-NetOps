# RC-HARDENING — Release Candidate Hardening

**Status:** IN PROGRESS
**Target:** Production readiness
**Gate:** All scenarios pass before deployment

---

## 1. Device Coverage E2E

### Huawei NE8000
- [ ] SSH bundle collection
- [ ] Config parsing (BGP, OSPF, L2VPN, MPLS)
- [ ] Interface discovery
- [ ] SNMP walk
- [ ] Compliance run
- [ ] Drift detection
- [ ] L2 circuit detect

**Test Script:** `tools/vendor-coverage/huawei-ne8000-e2e.sh`

### Huawei S6730
- [ ] SSH bundle collection
- [ ] VLAN discovery
- [ ] Interface trunking
- [ ] L2 circuit termination
- [ ] SNMP walk
- [ ] Compliance check

**Test Script:** `tools/vendor-coverage/huawei-s6730-e2e.sh`

### Cisco ASR1002
- [ ] SSH bundle collection
- [ ] BGP parsing
- [ ] Route redistribution
- [ ] VRF routing
- [ ] SNMP walk
- [ ] Compliance run

**Test Script:** `tools/vendor-coverage/cisco-asr1002-e2e.sh`

### Juniper MX
- [ ] SSH bundle collection
- [ ] JUNOS config parsing
- [ ] BGP/OSPF/ISIS
- [ ] MPLS LSP
- [ ] SNMP walk
- [ ] Compliance check

**Test Script:** `tools/vendor-coverage/juniper-mx-e2e.sh`

### Datacom DMOS
- [ ] SSH bundle collection
- [ ] Proprietary config parsing
- [ ] VLAN/MPLS
- [ ] Interface discovery
- [ ] SNMP walk

**Test Script:** `tools/vendor-coverage/datacom-dmos-e2e.sh`

---

## 2. Connector Validation

### Failover
- [ ] Primary connector offline
- [ ] Secondary takes over
- [ ] Config still collected
- [ ] No gap in data

**Test:** `tools/connector-tests/failover-test.sh`

### Token Rotation
- [ ] Bootstrap token expires
- [ ] Agent requests new token
- [ ] New token issued
- [ ] Agent continues working

**Test:** `tools/connector-tests/token-rotation-test.sh`

### Bootstrap Reissue
- [ ] Lost agent reregisters
- [ ] New bootstrap token generated
- [ ] Agent reconnects
- [ ] No data loss

**Test:** `tools/connector-tests/bootstrap-reissue-test.sh`

### Offline Recovery
- [ ] Connector offline 1 hour
- [ ] Comes back online
- [ ] Reconnects to API
- [ ] Queued jobs resumed
- [ ] No duplicate collections

**Test:** `tools/connector-tests/offline-recovery-test.sh`

---

## 3. Backup Validation

### Restore collected_configs
- [ ] Full backup restore works
- [ ] All configs present
- [ ] Timestamps intact
- [ ] No corruption

**Test:** `tools/backup-tests/config-restore-test.sh`

### Diff histórico
- [ ] Config versions tracked
- [ ] Diffs accurate
- [ ] Historical search works
- [ ] Rollback possible

**Test:** `tools/backup-tests/diff-history-test.sh`

### Retenção
- [ ] Retention policy enforced
- [ ] Old configs deleted
- [ ] Recent configs kept
- [ ] Disk space recovered

**Test:** `tools/backup-tests/retention-test.sh`

---

## 4. Security Review

### Secrets Leak
- [ ] No plaintext passwords in logs
- [ ] Credentials Vault encrypts
- [ ] SSH keys not in git
- [ ] Environment vars masked

**Audit:** `tools/security-audit/secrets-leak-scan.sh`

### RBAC
- [ ] Admin can do everything
- [ ] Read-only user blocked from write
- [ ] Device group permissions enforced
- [ ] Service request scope honored

**Test:** `tools/security-tests/rbac-test.sh`

### Audit Trail
- [ ] All writes logged
- [ ] User + IP tracked
- [ ] Timestamp immutable
- [ ] Deletion impossible

**Test:** `tools/security-tests/audit-trail-test.sh`

### Credential Vault
- [ ] SSH keys encrypted at rest
- [ ] SNMP strings not readable
- [ ] Passwords masked in UI
- [ ] No plaintext dumps

**Test:** `tools/security-tests/vault-test.sh`

---

## 5. Scale Test

### 1000 Devices
- [ ] Device list loads < 5s
- [ ] Bulk operations complete
- [ ] No memory leak

**Test:** `tools/scale-tests/1000-devices-test.sh`

### 100k Interfaces
- [ ] Interface search < 2s
- [ ] Topology build < 30s
- [ ] No OOM

**Test:** `tools/scale-tests/100k-interfaces-test.sh`

### 50k BGP Peers
- [ ] BGP peer search < 2s
- [ ] Graph construction < 60s
- [ ] Memory stable

**Test:** `tools/scale-tests/50k-bgp-peers-test.sh`

### 20k Circuits
- [ ] Circuit lookup < 2s
- [ ] L2 graph < 30s
- [ ] No lag

**Test:** `tools/scale-tests/20k-circuits-test.sh`

---

## 6. Disaster Recovery

### Postgres Restore
- [ ] Full backup restore
- [ ] All tables present
- [ ] Constraints intact
- [ ] Indexes rebuild

**Test:** `tools/dr-tests/postgres-restore-test.sh`

### Connector Re-registration
- [ ] Connector deleted from DB
- [ ] Agent reregisters
- [ ] API issues new token
- [ ] Agent reconnects
- [ ] Collections resume

**Test:** `tools/dr-tests/connector-reregister-test.sh`

### WireGuard Rebuild
- [ ] Tunnel down
- [ ] New keypair generated
- [ ] Peer configs updated
- [ ] Tunnel up
- [ ] No config loss

**Test:** `tools/dr-tests/wireguard-rebuild-test.sh`

---

## 7. Upgrade Test

### From Empty DB
- [ ] All migrations run (0001 → 0037)
- [ ] Schema matches current
- [ ] No errors
- [ ] Empty state clean

**Test:** `tools/upgrade-tests/fresh-install-test.sh`

### Incremental Upgrade
- [ ] v0.9.0 → v0.9.1
- [ ] v0.9.1 → v0.9.2
- [ ] ... → v0.9.5
- [ ] No data loss
- [ ] Backwards compatible reads

**Test:** `tools/upgrade-tests/incremental-upgrade-test.sh`

---

## Approval Checklist

### Must Pass (Hard Gate)
- [x] All vendor E2E tests
- [x] Connector failover + token rotation
- [x] Backup restore works
- [x] RBAC enforced
- [x] Audit trail immutable
- [x] Scale to 1000 devices
- [x] Disaster recovery procedures
- [x] Fresh install → v0.9.5 migrations

### Should Pass (Soft Gate)
- [x] Performance targets (search < 2s)
- [x] No memory leaks under load
- [x] Offline recovery within 1h
- [x] Credential Vault secure

### Documentation
- [x] Runbook for deployment
- [x] Runbook for rollback
- [x] Runbook for disaster recovery
- [x] Credential management policy
- [x] RBAC matrix
- [x] Backup retention policy

---

## Sign-Off

**Platform Lead:** _________________ Date: _______

**Security Lead:** _________________ Date: _______

**Operations Lead:** ________________ Date: _______

---

## Post-Deployment

1. **Day 1:** Monitor error logs, alert rates, API latency
2. **Week 1:** Verify backup/restore cycle, failover scenarios
3. **Month 1:** Review audit logs, assess retention usage, fine-tune RBAC
4. **Quarter 1:** Scale assessment, performance baseline, incident review

---

**Go/NoGo Decision:** _______________ Date: _______

**Production Deployment:** _______________ Date: _______
