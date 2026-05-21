# Community Library Specification

**Purpose:** Centralized registry of ASN:value community pairs and named lists  
**Source:** SSH config + discovery + manual curation  
**Usage:** Validation, preview, UI picker, audit trail

## Data Model

```typescript
interface CommunityEntry {
  community: string;      // "65001:100"
  asn: number;           // 65001
  value: number;         // 100
  name?: string;         // "Customer-ABC"
  description?: string;  // "Routes from ABC Inc"
  category?: "customer" | "internal" | "external" | "reserved" | "other";
  source: "config" | "manual" | "discovery";
  discoveredFrom?: string[];  // Peer IPs where seen
  appliedSince?: string;      // ISO date
  deprecated?: boolean;
  notes?: string;
}

interface CommunityList {
  name: string;          // "CUSTOMER_COMMUNITIES"
  description?: string;
  communities: string[];  // ["65001:100", "65001:101", "65001:102"]
  mode: "inclusive" | "exclusive";
  appliedTo?: string[];  // Policy names
  createdAt: string;
  lastModified: string;
  lastModifiedBy?: string;
  category?: "customer" | "internal" | "transit" | "other";
}

interface CommunityLibrary {
  version: "1.0";
  device: {
    id: number;
    hostname: string;
    localAsn: number;
  };
  communities: CommunityEntry[];
  lists: CommunityList[];
  metadata: {
    lastSync: string;
    syncSource: "snmp" | "ssh-config" | "manual";
    totalCommunities: number;
    totalLists: number;
    warnings?: string[];
  };
}
```

## Discovery Flow

### 1. SSH Config Parse

**Commands:**
```
display current-configuration configuration bgp
display route-policy <name>
display ip community-filter
display ip ip-prefix
```

**Extract:**
- Communities used in all route-policies
- Named community-lists from config
- Community filters for classification

### 2. SNMP BGP4-MIB Discovery

**OIDs:**
```
1.3.6.1.2.1.15.3.1.2  (bgpPeerState) — which peers are connected
1.3.6.1.2.1.15.3.1.7  (bgpPeerRemoteAddr) — peers we're learning from
```

**Logic:**
- For each established peer, infer possible communities
- Mark peers as sources: "Customer" vs "Provider" vs "IX" based on role
- Track which communities appear in import policies used by that peer

### 3. Categorization Rules

**Category Assignment:**
```
65000:x     → "reserved" (conflict check)
LocalASN:1  → "internal" (prefer for outbound filtering)
*:100       → "customer" (if used in customer import policy)
*:200       → "external" (if used in provider import policy)
*:300       → "transit" (if used in both)
```

## Library Endpoints (Read-Only FASE 6)

### GET /bgp-communities

```json
{
  "communities": [
    {
      "community": "65001:100",
      "asn": 65001,
      "value": 100,
      "name": "Customer-ABC-In",
      "category": "customer",
      "source": "config",
      "discoveredFrom": ["10.20.0.13", "10.20.0.18"],
      "appliedSince": "2026-04-15T00:00:00Z"
    }
  ],
  "lists": [
    {
      "name": "CUSTOMER_COMMUNITIES",
      "communities": ["65001:100", "65001:101"],
      "mode": "inclusive",
      "category": "customer"
    }
  ]
}
```

### GET /bgp-communities/{community}

```json
{
  "community": "65001:100",
  "usedInPolicies": [
    {
      "policy": "import-policy-v4-customers",
      "nodes": [10, 15]
    }
  ],
  "usedInLists": ["CUSTOMER_COMMUNITIES"],
  "discoveredFrom": ["10.20.0.13", "10.20.0.18"],
  "lastSeen": "2026-05-21T02:01:07Z"
}
```

### GET /bgp-communities/lists/{listName}

```json
{
  "name": "CUSTOMER_COMMUNITIES",
  "communities": [
    {"community": "65001:100", "name": "Customer-ABC-In"},
    {"community": "65001:101", "name": "Customer-XYZ-In"},
    {"community": "65001:102", "name": "Customer-LMN-In"}
  ],
  "mode": "inclusive",
  "usedInPolicies": ["import-policy-v4-customers", "import-policy-v6-customers"],
  "appliedToPeers": ["10.20.0.13", "10.20.0.18", "10.20.1.50"],
  "appliedSince": "2026-03-01T00:00:00Z"
}
```

## UI Community Picker (FASE 6 Preview)

### Component
```tsx
<CommunitySelector
  mode="individual"  // or "list"
  available={libraryData}
  selected={currentCommunities}
  editable={true}
  onSelect={handleSelection}
>
  {mode === "individual" && (
    <MultiSelect
      options={library.communities
        .filter(c => c.category === "customer")
        .map(c => ({
          value: c.community,
          label: `${c.community} (${c.name || "unnamed"})`,
          description: c.description
        }))}
    />
  )}

  {mode === "list" && (
    <SingleSelect
      options={library.lists
        .filter(l => l.category === "customer")
        .map(l => ({
          value: l.name,
          label: l.name,
          description: `${l.communities.length} communities`
        }))}
    />
  )}

  <PreviewDiff
    before={currentCommunities}
    after={selectedCommunities}
    library={library}
  />
</CommunitySelector>
```

## Validation Rules (FASE 6)

### Community Exists
```typescript
validate(community: string): {
  exists: boolean;
  warning?: string;
  alternatives?: string[];  // Similar communities
}
```

Example:
```json
{
  "exists": true,
  "entry": {
    "community": "65001:100",
    "name": "Customer-ABC-In",
    "category": "customer"
  }
}
```

### Community List Exists
```typescript
validate(listName: string): {
  exists: boolean;
  size: number;
  communities: string[];
  warning?: string;
}
```

Example:
```json
{
  "exists": true,
  "size": 3,
  "communities": ["65001:100", "65001:101", "65001:102"]
}
```

### Mode Consistency
```typescript
validateModeChange(
  from: "individual" | "list",
  to: "individual" | "list",
  communities: string[],
  lists: string[]
): {
  valid: boolean;
  warnings?: string[];
}
```

Example (individual → list):
```json
{
  "valid": true,
  "warnings": [
    "Mode change from 'individual' to 'list' may affect community ordering",
    "List 'CUSTOMER_COMMUNITIES' has 3 entries, current selection has only 1"
  ]
}
```

## Persistence (DB)

**Table:**
```sql
CREATE TABLE bgp_communities (
  id SERIAL PRIMARY KEY,
  device_id INT NOT NULL REFERENCES devices(id),
  community TEXT NOT NULL,
  asn INT NOT NULL,
  value INT NOT NULL,
  name TEXT,
  description TEXT,
  category TEXT,
  source TEXT,  -- 'config' | 'manual' | 'discovery'
  deprecated BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(device_id, community)
);

CREATE TABLE bgp_community_lists (
  id SERIAL PRIMARY KEY,
  device_id INT NOT NULL REFERENCES devices(id),
  name TEXT NOT NULL,
  communities TEXT[] NOT NULL,  -- ARRAY of "65001:100" strings
  mode TEXT,  -- 'inclusive' | 'exclusive'
  category TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(device_id, name)
);

CREATE TABLE bgp_community_usage (
  id SERIAL PRIMARY KEY,
  device_id INT NOT NULL REFERENCES devices(id),
  community TEXT NOT NULL,
  policy_name TEXT,
  node_id INT,
  peer_ip TEXT,
  first_seen TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW()
);
```

## Sync Job

**Frequency:** Daily 02:00 UTC  
**Source:** SSH config parse + SNMP BGP discovery  
**Action:**
1. Fetch current route-policies via SSH
2. Parse all communities and lists
3. Compare with DB library
4. Flag new communities as "discovery"
5. Flag deprecated communities as "not seen in N days"
6. Update appliedSince, lastSeen timestamps
7. Alert operator if suspicious community appears

## FASE 7: Manual Curation

**Allowed:**
- Add description to community
- Tag community with category (customer/internal/transit)
- Mark community as deprecated
- Rename community-list (with aliases tracking)
- Add notes

**Locked:**
- Community value itself (computed)
- ASN (device-specific)
- Applied peers (computed from policies)

## Audit Trail

**Event:**
```json
{
  "event": "community_editor_used",
  "timestamp": "2026-05-21T10:30:00Z",
  "user": "user@example.com",
  "action": "view",
  "community": "65001:100",
  "policy": "import-policy-v4-customers",
  "peer": "10.20.0.13",
  "preview": true,
  "applied": false
}
```

## Test Data

### 4WNET-BVA Device Library

```json
{
  "version": "1.0",
  "device": {"id": 1, "hostname": "4WNET-BVA-BRT-RX", "localAsn": 268521},
  "communities": [
    {"community": "65001:100", "name": "Customer-ABC-In", "category": "customer"},
    {"community": "65001:101", "name": "Customer-XYZ-In", "category": "customer"},
    {"community": "268521:100", "name": "Internal-Backup-Route", "category": "internal"},
    {"community": "268521:999", "name": "No-Export-Internal", "category": "internal"}
  ],
  "lists": [
    {"name": "CUSTOMER_COMMUNITIES", "communities": ["65001:100", "65001:101"]}
  ]
}
```
