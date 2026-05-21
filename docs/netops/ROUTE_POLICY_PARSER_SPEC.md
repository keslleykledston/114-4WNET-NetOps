# Route Policy Parser Specification

**Format:** Huawei VRP route-policy  
**Input:** SSH `display route-policy <name>`  
**Output:** Parsed JSON + metadata + edit constraints

## Input Example

```
route-policy import-policy-v4-customers
  node 10
    if-match ip-prefix customer-abc-in
    apply community 65001:100
    apply local-preference 150
  node 20
    apply community-list CUSTOMER_COMMUNITIES
  node 65535
    deny
```

## Parsed Output

```typescript
interface RoutePolicyNode {
  id: number;
  mode?: "permit" | "deny";
  ifMatch?: string[];     // OID references
  apply?: ApplyAction[];
  metadata?: {
    lineNumber: number;
    originalText: string;
  };
}

interface ApplyAction {
  type: "community" | "community-list" | "local-preference" | "as-path" | "qos-local-id" | "other";
  community?: string;      // e.g. "65001:100"
  list?: string;           // e.g. "CUSTOMER_COMMUNITIES"
  preference?: number;
  value?: string;
}

interface RoutePolicyCommunity {
  name: string;
  communities: string[];   // Individual: ["65001:100", "65001:101"]
  mode: "individual" | "list";
}

interface RoutePolicyParsed {
  name: string;
  nodes: RoutePolicyNode[];
  appliedTo?: string[];    // Peer IPs using this policy
  editConstraints: {
    canEditNodeIds: number[];
    cannotEditNodeIds: number[];
    canEditFields: string[];  // e.g. ["apply.community", "apply.community-list"]
    cannotEditFields: string[];  // e.g. ["ifMatch", "apply.localPreference"]
    preserveNodeId: 65535;   // Final deny node
  };
  warnings?: string[];
}
```

## Parser Rules

### Node ID Recognition
```
/^\s*node\s+(\d+)\s*$/
```

### If-Match Parsing
```
if-match <type> <reference>
  - ip-prefix <name>
  - ip-prefix <name> <name> ...
  - as-path <number>
  - route-type static|dynamic|all
```

### Apply Actions
```
apply community <community>           # e.g. "65001:100" (individual)
apply community-list <list-name>      # e.g. "CUSTOMER_COMMUNITIES"
apply local-preference <number>
apply as-path-filter <filter>
apply qos-local-id <id>
apply permit|deny
```

### Terminal Node Detection
```
node 65535
  deny
```

## Edit Constraints Logic

### Editable Nodes
- ✅ Nodes except final deny (65535)
- ✅ Fields: apply.community, apply.community-list
- ❌ Fields: if-match, apply.local-preference, apply.as-path

### Non-Editable Nodes
- ❌ Final deny node (65535)
- ❌ Any node with if-match condition (safety)
- ❌ Any node with local-preference (priority preservation)

### Edit Operations Allowed
- Change: community individual → community-list
- Change: community-list → different community-list
- Add: second community (mode: individual)
- Remove: community (mode: individual, keep ≥ 1)

### Edit Operations Blocked
- Modify if-match
- Modify local-preference
- Delete entire node
- Add new node
- Modify node 65535 (final deny)

## Validation

### Syntax Errors
```
❌ Invalid community format: "ABC:100"
❌ Unrecognized apply action: "apply routing-domain"
❌ If-match without node context
```

### Semantic Warnings
```
⚠️ Node has no permit/deny explicit, defaults to permit
⚠️ Node 65535 (final deny) should be last
⚠️ Community list not found in config: "UNKNOWN_LIST"
```

### Edit Validation

**Input:**
```typescript
{
  policy: "import-policy-v4-customers",
  nodeId: 10,
  field: "apply",
  change: {
    from: [{"type": "community", "community": "65001:100"}],
    to: [{"type": "community-list", "list": "CUSTOMER_COMMUNITIES"}]
  }
}
```

**Checks:**
1. Node 10 exists ✓
2. Node 10 ≠ 65535 ✓
3. Node 10 has no if-match (or has one to keep) ✓
4. Field "apply" is editable ✓
5. Community-list "CUSTOMER_COMMUNITIES" exists in config ✓
6. Mode change individual → list is valid ✓

**Output:**
```typescript
{
  valid: true,
  warnings: ["Mode change detected: priority may shift"],
  expectedDiff: {
    nodeId: 10,
    before: "apply community 65001:100",
    after: "apply community-list CUSTOMER_COMMUNITIES"
  },
  expectedCommands: [
    "route-policy import-policy-v4-customers",
    "node 10",
    "apply community-list CUSTOMER_COMMUNITIES",
    "quit"
  ]
}
```

## Command Generation

### Template
```
route-policy {policyName}
node {nodeId}
{apply commands}
quit
```

### Examples

**Individual → List Mode Change:**
```
route-policy import-policy-v4-customers
node 10
apply community-list CUSTOMER_COMMUNITIES
quit
```

**List → Different List:**
```
route-policy import-policy-v4-customers
node 20
apply community-list NEW_CUSTOMER_LIST
quit
```

**Remove Community (Individual Mode):**
```
route-policy import-policy-v4-customers
node 10
undo apply community 65001:100
quit
```

## Implementation

**File:**
```
workspace/artifacts/api-server/src/modules/netops/bgp/route-policy-parser.ts
```

**Functions:**
```typescript
parseRoutePolicyOutput(text: string): RoutePolicyParsed
validateEdit(policy: RoutePolicyCommunity, edit: PolicyEdit): ValidationResult
generateApplyCommands(policy: string, nodeId: number, apply: ApplyAction[]): string[]
```

## Test Cases

### Case 1: Simple Community Edit
```
Input: node 10 "apply community 65001:100" → "apply community-list CUST_LIST"
Expect: valid=true, commands generated
```

### Case 2: Block If-Match Preservation
```
Input: node 10 "if-match ip-prefix customer-abc-in apply community 65001:100"
Expect: valid=true for apply field, but warn "if-match prevents full edit"
```

### Case 3: Block Final Deny Edit
```
Input: node 65535 "deny" → any change
Expect: valid=false, message "Node 65535 is final deny, not editable"
```

### Case 4: Community List Not Found
```
Input: apply community-list "NONEXISTENT"
Expect: valid=false, message "Community list not found in config"
```

### Case 5: Mode Switch with Warnings
```
Input: individual ["65001:100"] → list ["CUSTOMER_COMMUNITIES"]
Expect: valid=true, warning "2 communities in list, may affect preference order"
```
