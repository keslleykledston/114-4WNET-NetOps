# BGP Community-filter Resmoke

Device: 1 4WNET-BVA-BRT-RX
Snapshot: 34 status=cached sources=ssh_running_config,local_db,local_db
Compliance job: 59

## Parser

- Snapshot community-filters: 251
- Raw-config parsed community-filters: 301
- Basic permit without index parser fixture: name=FNA-EXPORT-P1, index=null, action=permit, value=64777:58301
- Basic permit with index parser fixture: name=FNA-EXPORT-P1, index=10, action=permit, value=64777:58301
- Live/snapshot basic permit without index examples: 0
- Live/snapshot basic permit with index examples: 249

## Route-policy Nodes

- Nodes checked: 888
- Bad permit/deny node count: 0
- 4WNET-MALHA-IP-MNS-IMPORT node=10 action=permit
- 4WNET-MALHA-IP-MNS-IMPORT node=600 action=deny
- AS262663-IMPACTUS-Export node=600 action=deny
- AS262663-IMPACTUS-Import node=10 action=permit
- AS262663-IMPACTUS-Import node=600 action=deny
- AS262663-WIFIZAO-Import-V4 node=10 action=deny
- AS262663-WIFIZAO-Import-V4 node=600 action=deny
- AS262663-WIFIZAO.BRT-Export-IPv4 node=600 action=permit

## Dependencies

- FOUND: 426
- MISSING: 0

### FOUND Evidence

- AS269534-UPLINK-Import-V4 node 2: community-filter CL-NO-EXPORT-EBT encontrado no snapshot.
- AS269534-UPLINK-Import-V4 node 11: community-filter CL-NO-EXPORT-VTAL encontrado no snapshot.
- AS270966-4WNET-MNS-Export-V4 node 501: community-filter C21-EXPORT-P1 encontrado no snapshot.
- AS270966-4WNET-MNS-Export-V4 node 502: community-filter C21-EXPORT-P2 encontrado no snapshot.
- AS270966-4WNET-MNS-Export-V4 node 503: community-filter C21-EXPORT-P3 encontrado no snapshot.
- AS270966-4WNET-MNS-Export-V4 node 504: community-filter C21-EXPORT-P4 encontrado no snapshot.
- AS270966-4WNET-MNS-Export-V4 node 505: community-filter C21-EXPORT-P5 encontrado no snapshot.
- AS270966-4WNET-MNS-Import-V4 node 4: community-filter C01-EXPORT-P1 encontrado no snapshot.
- AS270966-4WNET-MNS-Import-V4 node 20: community-filter C14-EXPORT-P1 encontrado no snapshot.
- AS270966-4WNET-MNS-Import-V4 node 216: community-filter C16-EXPORT-P1 encontrado no snapshot.
- AS270966-MS-FIBRA-Export node 20: community-filter C07-RECEIVED encontrado no snapshot.
- AS278707-4WNET-MNS-Export-V6 node 10: community-filter C20-EXPORT-P1 encontrado no snapshot.

### MISSING Evidence

- Nenhuma dependência MISSING no snapshot atual.

### Synthetic MISSING Evidence

- severity=medium: Route-policy RESMOKE-MISSING-CF node 2013 referencia community-filter RESMOKE-CF-MISSING, mas ele não foi encontrado no snapshot (ssh_running_config).

## Findings

- Persisted findings: 140
- Generic message count: 0
- FOUND dependency risk findings: 0
- Specific MISSING findings: 0
- Critical MISSING findings: 0
- Synthetic specific MISSING findings: 1
- MISSING severities: n/a

## Safety

- No device write commands executed.
- No NetBox writes executed.
- No sync executed.
- No apply plan executed.

## Result

GO
