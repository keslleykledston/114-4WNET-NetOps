# Topology Data Model

## Schema

### topology_nodes

```sql
id              SERIAL PRIMARY KEY
node_type       TEXT (DEVICE|INTERFACE|BGP_PEER|L2_CIRCUIT|VSI|VRF|SERVICE|RESOURCE)
ref_id          INTEGER (reference to device/interface/service/etc in original table)
label           TEXT (human-readable label)
metadata_json   JSONB (flexible attributes)
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

**Unique Constraint:** (node_type, ref_id, label)

### topology_edges

```sql
id              SERIAL PRIMARY KEY
source_node_id  INTEGER → topology_nodes(id)
target_node_id  INTEGER → topology_nodes(id)
edge_type       TEXT (HAS_INTERFACE|CONNECTED_TO|...)
confidence      INTEGER (0-100)
metadata_json   JSONB
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

**Unique Constraint:** (source_node_id, target_node_id, edge_type)

### topology_snapshots

```sql
id              SERIAL PRIMARY KEY
scope_type      TEXT (global|site|device)
scope_id        INTEGER (for site/device scopes)
nodes_count     INTEGER
edges_count     INTEGER
created_at      TIMESTAMP
```

## Node Types

| Type | Purpose | ref_id | Example Label |
|------|---------|--------|---|
| DEVICE | Router/Switch | device.id | router1 |
| INTERFACE | Physical/Logical | interface.id | Eth0/0 |
| BGP_PEER | BGP neighbor | bgp_peer.id | 10.0.0.1 (AS65001) |
| L2_CIRCUIT | L2VC/VSI | l2circuit.id | L2VC-VC123 |
| VSI | Virtual Service Instance | vsi.id | VSI-100 |
| VRF | VRF instance | vrf.id | Customer-A |
| SERVICE | Service request | service_request.id | SR-1001-L2VC |
| RESOURCE | Resource allocation | resource_alloc.id | VLAN-100 |

## Edge Types

| Type | Source → Target | Confidence | Example |
|------|---|---|---|
| HAS_INTERFACE | DEVICE → INTERFACE | 100 | Router has Eth0/0 |
| HAS_BGP_PEER | DEVICE → BGP_PEER | 100 | Router has BGP peer 10.0.0.1 |
| HAS_L2_CIRCUIT | DEVICE → L2_CIRCUIT | 100 | Router A terminates VC123 |
| HAS_VSI | DEVICE → VSI | 100 | PE has VSI-100 |
| CONNECTED_TO | L2_CIRCUIT ↔ L2_CIRCUIT | 50-90 | VC123@RouterA ↔ VC123@RouterZ |
| USES_RESOURCE | Service/Circuit → RESOURCE | 100 | Service uses VLAN-100 |
| BELONGS_TO_VRF | INTERFACE → VRF | 100 | Interface in Customer-A VRF |
| SERVICE_ON_DEVICE | SERVICE → DEVICE | 100 | Service runs on Router |
| SERVICE_USES_CIRCUIT | SERVICE → L2_CIRCUIT | 100 | Service uses VC123 |

## Queries

### Find all interfaces on a device
```sql
SELECT n2.* FROM topology_nodes n1
JOIN topology_edges e ON n1.id = e.source_node_id
JOIN topology_nodes n2 ON e.target_node_id = n2.id
WHERE n1.node_type = 'DEVICE' AND n1.ref_id = 42
  AND e.edge_type = 'HAS_INTERFACE';
```

### Find L2 circuits without remote endpoint
```sql
SELECT n1.* FROM topology_nodes n1
WHERE n1.node_type = 'L2_CIRCUIT'
  AND n1.id NOT IN (
    SELECT DISTINCT source_node_id FROM topology_edges
    WHERE edge_type = 'CONNECTED_TO'
  );
```

### Find services affected by a circuit failure
```sql
SELECT n3.* FROM topology_nodes n1
JOIN topology_edges e1 ON n1.id = e1.target_node_id
JOIN topology_nodes n2 ON e1.source_node_id = n2.id
JOIN topology_edges e2 ON n2.id = e2.target_node_id
JOIN topology_nodes n3 ON e2.source_node_id = n3.id
WHERE n1.node_type = 'L2_CIRCUIT' AND n1.ref_id = 10
  AND e1.edge_type = 'SERVICE_USES_CIRCUIT'
  AND n3.node_type = 'SERVICE';
```

## Metadata Examples

**DEVICE metadata:**
```json
{
  "vendor": "Huawei",
  "model": "NE40E",
  "site": "DC1",
  "region": "us-east"
}
```

**L2_CIRCUIT metadata:**
```json
{
  "vcId": 123,
  "vlan": 100,
  "bandwidth": "1Gbps",
  "provider": "carrier-x"
}
```

**BGP_PEER metadata:**
```json
{
  "asn": "65001",
  "address": "10.0.0.1",
  "state": "Established",
  "prefixCount": 1000
}
```

## Performance

**Indexes:**
- topology_nodes (node_type, ref_id)
- topology_edges (source_node_id, target_node_id, edge_type)
- topology_snapshots (scope_type, scope_id)

**Typical Cardinality:**
- ~2,000 devices → 2,000 device nodes
- ~8,000 interfaces → 8,000 interface nodes
- ~500 BGP peers → 500 peer nodes
- ~200 L2 circuits → 200 circuit nodes
- ~10,000 edges

Total graph: ~20k nodes, ~20k edges → millisecond queries

---

**Version:** v0.9.4
**Last Updated:** 2026-05-31
