# E2E Huawei Validation Guide — Phase v0.5.1

## Purpose

End-to-end validation of the connector system with a **real Huawei CE6881 device** or fixture-based simulation. Verifies:

- WireGuard handshake and connectivity
- SSH connectivity and config bundle collection  
- L2 circuit discovery and parsing
- BGP peer discovery and parsing
- SNMP interface operational data
- Connector health monitoring
- Secret masking in logs
- Dashboard data population

## Prerequisites

### Real Device Setup
1. Huawei CE6881 (or compatible VRP device) with SSH enabled
2. Device reachable from connector host via WireGuard VPN
3. Device SSH credentials (read-only access sufficient)
4. BGP and L2VPN configured on device

### Test Environment
```bash
docker-compose up -d  # Start API, db, WireGuard hub
export API_BASE=http://localhost:8085
export ADMIN_EMAIL=admin@example.com
export ADMIN_PASSWORD=admin123456
```

### Network Requirements
- Connector host must have WireGuard interface up
- Connector host must reach device SSH (22/tcp)
- Device must route back through WireGuard tunnel

## Running E2E Tests

### Fixture-Based (No Real Device)
Uses embedded fixture data (display output samples):

```bash
node tools/e2e-huawei-connector-real.mjs
```

**What it does:**
1. Login as admin
2. Create tenant + connector
3. Generate bootstrap token
4. Simulate heartbeat (WireGuard UP)
5. Create Huawei device record
6. Enqueue SSH_CONFIG_BUNDLE job
7. Submit result with fixture output
8. Parse L2 circuits from fixtures
9. Parse BGP peers from fixtures
10. Verify health dashboard
11. Validate audit logs (no secret leak)

**Expected output:**
```
✓ Tenant created
✓ Connector created
✓ Bootstrap package generated
✓ Heartbeat successful
✓ Device created
✓ SSH job created
✓ Job completed
✓ L2 circuits discovered: 2 circuits
✓ BGP peers discovered: 2 peers
✓ Connector health: HEALTHY (score=95)
✓ Audit logs: no secrets leaked

🎉 Phase v0.5.1 E2E Test Complete
```

### Real Device (Optional)

If you have a real device reachable:

```bash
# Device must be reachable via connector's WireGuard interface
device_ip=10.20.1.10  # Your device's LAN IP
ssh -i ~/.ssh/device_key admin@${device_ip}
  # Verify access works
  
# Then run E2E — connector will:
# 1. Send job to agent
# 2. Agent connects via WireGuard
# 3. Agent runs SSH commands on real device
# 4. Parser processes real output
```

## Validation Checklist

### Step 1: Connector & WireGuard
- [ ] Connector status: ONLINE
- [ ] WireGuard status: UP
- [ ] Last heartbeat age: < 60 seconds
- [ ] WG handshake age: < 60 seconds
- [ ] Health score: > 80

### Step 2: L2 Circuits
- [ ] Device has L2 circuits in inventory
- [ ] Circuit types detected: l2vc, vsi, or vlan
- [ ] Operational status appears (UP or DOWN)
- [ ] Findings/anomalies reported if applicable
- [ ] Panel shows circuits with correct VLAN/VC IDs

### Step 3: BGP Discovery
- [ ] Device has BGP peers in inventory
- [ ] Peer count > 0
- [ ] Peer FSM state detected (Established, Idle, etc.)
- [ ] Received/advertised prefix counts > 0 (for UP peers)
- [ ] Panel shows peer list with status

### Step 4: SNMP Interface Collection
- [ ] Device interfaces collected
- [ ] Interface operational status appears
- [ ] Speed/MTU populated (if available)
- [ ] Interface count matches device

### Step 5: Security
- [ ] No plaintext password in audit logs
- [ ] No connector token in any API response
- [ ] No SSH commands logged with credentials
- [ ] Payload masking active for sensitive fields

### Step 6: Dashboard
- [ ] Connector dashboard shows health metrics
- [ ] L2 circuits tab shows discovered circuits
- [ ] BGP tab shows peer list
- [ ] Alert count reflects anomalies
- [ ] Freshness indicators show collection age

## Test Data

### Huawei Display Version Output
```
Huawei Technologies Co., Ltd.
HUAWEI CE6881-48S6D
Software Version V800R020C10SPC500
```

### Huawei L2VC Verbose Output
```
L2VC ID: 1001
L2VC Name: VC-SITE-A
L2VC Type: Ethernet
AdminStatus: up
OperStatus: up
Peer IP: 10.20.1.2
OuterVlan: 100
Interface: GE0/0/1
PW Status: UP
```

### Huawei BGP Peer Verbose Output
```
BGP Peer is 10.10.1.1, remote AS 65001
Type: EBGP link
Peer Description: "ISP-PRIMARY"
BGP current state: Established, Up for 14d18h32m10s
Received total routes: 1200
Advertised total routes: 45
```

### Huawei Interface Brief Output
```
Interface      IP-Address      Status      MTU
GE0/0/1        192.168.1.1     up         1500
GE0/0/2        unassigned      down       1500
LoopBack0      10.0.0.1        up         65535
```

## Troubleshooting

### "WireGuard handshake age too old"
- Check WireGuard status on connector host: `wg show`
- Verify hub endpoint reachable: `ping vpn.netops.local`
- Check connector logs for handshake errors

### "No L2 circuits found"
- Verify `display mpls l2vc verbose` works on device
- Check SSH job output in connector logs
- Verify parser recognizes output format

### "BGP peers not discovered"
- Verify `display bgp peer verbose` returns output
- Check if device has any BGP neighbors configured
- Verify VRF name (if using VRF, may need filter)

### "Secrets appear in audit logs"
- Check maskSensitivePayload() is being called
- Verify password redaction in logs
- Review connector-payload-mask.ts for missing keys

### "Dashboard not updating"
- Check `/api/connectors/health/summary` returns data
- Verify last heartbeat timestamp is recent
- Check database freshnessExpiresAt not in past

## Performance Baselines

| Operation | Expected Time |
|-----------|---|
| Heartbeat round-trip | < 500 ms |
| SSH config bundle collection | < 30 s |
| L2 circuit parsing | < 100 ms |
| BGP peer parsing | < 50 ms |
| Dashboard health query | < 200 ms |

## Next Steps

After E2E passes:
1. Run full smoke test: `node tools/connectors-release-smoke.mjs`
2. Check security: `node tools/connectors-secure-onboarding-selftest.mjs`
3. Validate parsers: `node tools/connectors-config-bundle-parse-selftest.mjs`
4. Deploy to staging
5. Run against real production device for final validation

## References

- [Secure Onboarding](./SECURE_ONBOARDING.md) — Bootstrap token flow
- [Config Bundle Parser](../config-backup/config-bundle-parser.service.ts) — L2 and BGP parsing
- [Huawei VRP Commands](../huawei-vrp/commands.ts) — Allowed SSH commands
- [L2 Circuits Schema](../../workspace/lib/db/src/schema/l2circuits.ts) — Database schema
- [Connector Health](../connectors/connector-health.service.ts) — Health scoring
