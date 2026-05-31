# Production Deployment Guide

**Version:** v0.9.5
**Last Updated:** 2026-05-31

---

## Pre-Deployment Checklist

### 1. RC-HARDENING Gate
- [ ] All device vendor tests passed
- [ ] Connector failover validated
- [ ] Backup/restore tested
- [ ] RBAC enforced
- [ ] Security audit clean
- [ ] Scale tests passed (1000 devices)
- [ ] Disaster recovery procedures documented

### 2. Infrastructure
- [ ] PostgreSQL 14+ configured
- [ ] Backups scheduled (daily)
- [ ] WireGuard network ready
- [ ] DNS entries added
- [ ] SSL certificates valid
- [ ] Network ACLs configured
- [ ] Monitoring alerts enabled

### 3. Credentials
- [ ] SSH keys generated + distributed
- [ ] Credential Vault initialized
- [ ] Backup encryption key stored (HSM?)
- [ ] Database password rotated
- [ ] API tokens invalidated (old)

### 4. Team
- [ ] Oncall rotation defined
- [ ] Runbook reviewed + tested
- [ ] Rollback procedure documented
- [ ] Incident response plan in place

---

## Deployment Steps

### Phase 1: Database Migration (Downtime: ~5 min)

```bash
# 1. Stop API server
systemctl stop netops-api

# 2. Backup current database
pg_dump netops > /backup/netops_pre_deploy_$(date +%s).sql

# 3. Run all pending migrations (0001 → 0037)
pnpm db:migrate

# 4. Verify schema
psql netops -c "\dt" | wc -l  # Should match expected table count

# 5. Start API server
systemctl start netops-api

# 6. Health check
curl http://localhost:8085/api/health
```

### Phase 2: Deploy API Server

```bash
# 1. Build docker image
docker build -t netops-api:v0.9.5 .

# 2. Push to registry
docker push registry.company.com/netops-api:v0.9.5

# 3. Update deployment
kubectl set image deployment/netops-api api=registry.company.com/netops-api:v0.9.5

# 4. Wait for rollout
kubectl rollout status deployment/netops-api --timeout=5m

# 5. Verify endpoints responding
for i in {1..10}; do
  curl -s http://netops-api.prod:8085/api/health && echo "OK" && break || sleep 10
done
```

### Phase 3: Deploy UI Server

```bash
# 1. Build frontend
pnpm build

# 2. Deploy to CDN
aws s3 sync dist/ s3://netops-ui-prod/ --delete

# 3. Invalidate cache
aws cloudfront create-invalidation --distribution-id E1234EXAMPLE --paths "/*"

# 4. Verify UI loading
curl -s https://netops.company.com | grep "Topology Intelligence" && echo "OK"
```

### Phase 4: Connector Deployment

```bash
# 1. Prepare new connector config
cat > connector-config.yaml <<EOF
api_endpoint: https://netops-api.prod:8085
bootstrap_token: $(cat /secure/bootstrap_token)
wireguard_privatekey: $(cat /secure/wg_privatekey)
wireguard_publickey: $(cat /secure/wg_publickey)
device_groups:
  - sites: ["DC1", "DC2"]
    collectors: ["snmp", "ssh", "bgp"]
EOF

# 2. Push to connectors (rolling)
for connector in connector-1 connector-2 connector-3; do
  scp connector-config.yaml $connector:/etc/netops/
  ssh $connector "systemctl restart netops-connector"
  sleep 30
  ssh $connector "systemctl status netops-connector" || exit 1
done
```

---

## Verification

### Health Checks

```bash
# 1. API responding
curl -s http://netops-api:8085/api/health | jq .

# 2. Database connected
curl -s http://netops-api:8085/api/devices | jq '.[] | .id' | head -1

# 3. Connectors registered
curl -s http://netops-api:8085/api/connectors | jq '.[] | .status' | grep -c "ONLINE"

# 4. Topology built
curl -s http://netops-api:8085/api/topology/summary | jq .

# 5. Compliance running
curl -s http://netops-api:8085/api/compliance/dashboard | jq '.passedJobs'
```

### Log Checks

```bash
# 1. No errors in API logs
tail -100 /var/log/netops/api.log | grep -i error | wc -l  # Should be 0

# 2. Connectors collecting
grep "collected config" /var/log/netops/connector.log | tail -5

# 3. Background jobs running
curl -s http://netops-api:8085/api/jobs | jq '.[] | select(.status=="running") | .type'
```

---

## Rollback Procedure

### If API fails
```bash
# 1. Revert to previous image
kubectl set image deployment/netops-api api=registry.company.com/netops-api:v0.9.4

# 2. Wait for rollout
kubectl rollout status deployment/netops-api

# 3. Verify
curl http://netops-api:8085/api/health
```

### If database migrations fail
```bash
# 1. Stop API
systemctl stop netops-api

# 2. Restore from backup
psql netops < /backup/netops_pre_deploy_<timestamp>.sql

# 3. Revert to previous API version
docker pull registry.company.com/netops-api:v0.9.4
docker tag registry.company.com/netops-api:v0.9.4 netops-api:latest

# 4. Restart
systemctl start netops-api
```

---

## Post-Deployment

### Day 1
- [ ] Monitor error rate (target: < 0.1%)
- [ ] Check alert volume (normal baseline?)
- [ ] Review connector logs for issues
- [ ] Verify backup completed successfully

### Week 1
- [ ] Run failover test
- [ ] Test backup restore
- [ ] Check disk usage trend
- [ ] Review audit logs for suspicious activity

### Month 1
- [ ] Full disaster recovery drill
- [ ] Performance baseline assessment
- [ ] RBAC audit (verify permissions)
- [ ] Incident review (any customer-facing issues?)

---

## Monitoring

### Key Metrics
- API response time (p99 < 500ms)
- Database query time (p99 < 100ms)
- Connector heartbeat rate (> 95%)
- Backup success rate (100%)
- Error rate (< 0.1%)

### Alerts
```yaml
- name: APILatencyHigh
  query: histogram_quantile(0.99, api_request_duration_seconds) > 0.5
  
- name: DBConnectionPoolExhausted
  query: pg_pool_usage > 0.95
  
- name: ConnectorOffline
  query: connector_status == "OFFLINE"
  
- name: BackupFailed
  query: backup_last_success_timestamp < now() - 25h
```

---

## Support Contacts

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Platform Lead | John Doe | +1-555-0100 | john@company.com |
| Security Lead | Jane Smith | +1-555-0101 | jane@company.com |
| Ops Lead | Bob Johnson | +1-555-0102 | bob@company.com |
| Oncall (24/7) | Pagerduty | - | netops-oncall@company.com |

---

**Deployment approved by:** _________________ Date: _______

**Deployment completed at:** _________________ UTC: _______

**Issues encountered:** ____________________________________________

**Rollback required:** [ ] YES [ ] NO

**Signed by:** _________________ Title: _______
