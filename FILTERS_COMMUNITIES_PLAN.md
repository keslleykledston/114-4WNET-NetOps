# Implementação: Filters & Communities (BGP Route-Policies)

## Overview

Port community-filter library + community-list sets + route-policy application from 60-bgp_manager to NetOps TypeScript stack.

**Data persistence:** Device discovery snapshot model — communities collected first SSH query, cached in DB.

**Scope Phase 1:**
- Backend: Parser (community-filter + community-list from running-config)
- Backend: Models (CommunityLibraryItem, CommunitySet, CommunitySetMember)
- Backend: Service (queryDiscoveryCommunities → collection + sync)
- Backend: Apply service (preview + deploy via SSH)
- Frontend: Tabs (Communities + Filters) in device-detail
- Frontend: List + Edit UI with inline editing

---

## Data Model (Drizzle Schema)

### community_library_items

```typescript
export const communityLibraryItems = pgTable(
  "community_library_items",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id),
    filterName: varchar("filter_name", { length: 128 }).notNull(),
    communityValue: varchar("community_value", { length: 512 }).notNull(),
    matchType: varchar("match_type", { length: 16 }).notNull(), // basic | advanced
    action: varchar("action", { length: 8 }).notNull().default("permit"), // permit | deny
    indexOrder: integer("index_order"),
    origin: varchar("origin", { length: 40 })
      .notNull()
      .default("discovered_running_config"), // discovered_running_config | discovered_live | manual
    description: text("description"),
    tagsJson: jsonb("tags_json"),
    isSystem: boolean("is_system").default(false),
    isActive: boolean("is_active").default(true),
    usageCount: integer("usage_count").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
  },
  (table) => [
    uniqueIndex("uq_community_lib_device_filter_value_match").on(
      table.deviceId,
      table.filterName,
      table.communityValue,
      table.matchType
    ),
    index("idx_device_id").on(table.deviceId),
    index("idx_filter_name").on(table.filterName),
  ]
);
```

### community_sets

```typescript
export const communitySets = pgTable(
  "community_sets",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    vrpObjectName: varchar("vrp_object_name", { length: 63 }).notNull(),
    origin: varchar("origin", { length: 40 })
      .notNull()
      .default("app_created"), // app_created | discovered_running_config
    discoveredMembersJson: jsonb("discovered_members_json"), // legacy
    impliedConfigPreview: text("implied_config_preview"),
    description: text("description"),
    status: varchar("status", { length: 32 }).notNull().default("draft"), // draft | ready | applied
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
  },
  (table) => [
    uniqueIndex("uq_community_set_device_slug").on(table.deviceId, table.slug),
    uniqueIndex("uq_community_set_device_vrp_name").on(table.deviceId, table.vrpObjectName),
    index("idx_device_id").on(table.deviceId),
  ]
);
```

### community_set_members

```typescript
export const communitySetMembers = pgTable(
  "community_set_members",
  {
    id: serial("id").primaryKey(),
    communitySetId: integer("community_set_id")
      .notNull()
      .references(() => communitySets.id, { onDelete: "cascade" }),
    communityValue: varchar("community_value", { length: 512 }).notNull(),
    linkedLibraryItemId: integer("linked_library_item_id").references(
      () => communityLibraryItems.id,
      { onDelete: "set null" }
    ),
    missingInLibrary: boolean("missing_in_library").default(false),
    valueDescription: text("value_description"),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    uniqueIndex("uq_set_member_set_value").on(
      table.communitySetId,
      table.communityValue
    ),
    index("idx_community_set_id").on(table.communitySetId),
  ]
);
```

### community_change_audit

```typescript
export const communityChangeAudit = pgTable(
  "community_change_audit",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    communitySetId: integer("community_set_id").references(
      () => communitySets.id,
      { onDelete: "set null" }
    ),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 24 }).notNull(), // preview | apply | rollback
    candidateConfigText: text("candidate_config_text").notNull(),
    commandSentText: text("command_sent_text"),
    deviceResponseText: text("device_response_text"),
    status: varchar("status", { length: 16 }).notNull(), // success | error | pending
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  },
  (table) => [
    index("idx_device_id").on(table.deviceId),
    index("idx_community_set_id").on(table.communitySetId),
  ]
);
```

---

## Backend Implementation

### 1. Types & Schemas

**File:** `workspace/lib/api-zod/src/generated/types/communityLibraryItem.ts`

```typescript
export interface CommunityLibraryItem {
  id: number;
  deviceId: number;
  companyId: number;
  filterName: string;
  communityValue: string;
  matchType: "basic" | "advanced";
  action: "permit" | "deny";
  indexOrder?: number | null;
  origin: "discovered_running_config" | "discovered_live" | "manual";
  description?: string | null;
  tagsJson?: Record<string, unknown> | null;
  isSystem: boolean;
  isActive: boolean;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunitySetMember {
  id?: number;
  position: number;
  communityValue: string;
  linkedLibraryItemId?: number | null;
  missingInLibrary: boolean;
  linkedFilterName: string;
  valueDescription?: string | null;
}

export interface CommunitySet {
  id: number;
  deviceId: number;
  companyId: number;
  name: string;
  slug: string;
  vrpObjectName: string;
  origin: "app_created" | "discovered_running_config";
  discoveredMembersJson?: string[] | null;
  impliedConfigPreview?: string | null;
  description?: string | null;
  status: "draft" | "ready" | "applied";
  createdBy?: number | null;
  updatedBy?: number | null;
  createdAt: Date;
  updatedAt: Date;
  members: CommunitySetMember[];
  membersTotal: number;
  membersResolved: number;
  membersMissing: number;
}

export interface CommunityPreviewRequest {
  direction?: "received" | "advertised";
  limit?: number;
  filter?: string;
}

export interface CommunityPreviewResponse {
  candidateConfigText: string;
  candidateSha256: string;
  warnings: string[];
  membersMissingLibrary: number;
  missingCommunityValues: string[];
}

export interface CommunityApplyRequest {
  confirm: boolean;
  expectedCandidateSha256: string;
  acknowledgeMissingLibraryRefs: boolean;
}

export interface CommunityApplyResponse {
  ok: boolean;
  status: "success" | "error" | "pending";
  message: string;
  deviceResponseExcerpt?: string | null;
}
```

### 2. Parser (`huawei-community-parser.ts`)

**File:** `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/community-parser.ts`

Adapt Python parser logic:
- Extract `ip community-filter` entries
- Extract `ip community-list` + members
- Track route-policy references
- Return structured data

```typescript
export interface CommunityFilterEntry {
  matchType: "basic" | "advanced";
  name: string;
  index: number;
  action: "permit" | "deny";
  value: string;
}

export interface CommunityListEntry {
  listName: string;
  value: string;
  lineOrder: number;
  valueDescription?: string | null;
}

export interface RoutePolicyCommunityRef {
  routePolicy: string;
  node: string;
  filterName: string;
}

export interface ParsedRunningConfigCommunities {
  communityFilters: CommunityFilterEntry[];
  communityLists: CommunityListEntry[];
  routePolicyIfMatch: RoutePolicyCommunityRef[];
}

export function parseRunningConfigCommunities(
  configText: string
): ParsedRunningConfigCommunities;

export function formatPhase1CommunityListBlock(
  vrpObjectName: string,
  communityValues: string[]
): string;
```

### 3. Service: Discovery Integration

**File:** `workspace/artifacts/api-server/src/modules/netops/device-discovery/services/community-discovery.service.ts`

Collect communities on first SSH query (part of device snapshot):

```typescript
export async function queryDiscoveryCommunities(
  device: Device,
  runningConfig: string
): Promise<{
  libraryItems: CommunityLibraryItemCreate[];
  communitySets: CommunitySetCreate[];
  routePolicyRefs: RoutePolicyCommunityRef[];
}>;
```

### 4. Service: Apply Communities

**File:** `workspace/artifacts/api-server/src/modules/netops/device-discovery/services/community-apply.service.ts`

```typescript
export async function buildCommunityPreview(
  db: Db,
  device: Device,
  communitySet: CommunitySet
): Promise<CommunityPreviewResponse>;

export async function applyCommunitySet(
  db: Db,
  device: Device,
  communitySet: CommunitySet,
  request: CommunityApplyRequest
): Promise<CommunityApplyResponse>;
```

### 5. Routes: API Endpoints

**File:** `workspace/artifacts/api-server/src/modules/netops/device-discovery/community.routes.ts`

```
POST   /api/devices/:id/communities/sync
GET    /api/devices/:id/communities/library
GET    /api/devices/:id/community-sets
POST   /api/devices/:id/community-sets
PUT    /api/devices/:id/community-sets/:setId
DELETE /api/devices/:id/community-sets/:setId
POST   /api/devices/:id/community-sets/:setId/preview
POST   /api/devices/:id/community-sets/:setId/apply
GET    /api/devices/:id/community-change-audit
```

### 6. Update OpenAPI Spec

Add schemas + paths for community endpoints.

---

## Frontend Implementation

### 1. API Hook

**File:** `workspace/artifacts/netops-manager/src/features/device-discovery/community-api.ts`

```typescript
export function useCommunityLibraryItems(deviceId: number) {
  return useQuery({
    queryKey: ["communityLibrary", deviceId],
    queryFn: () => apiClient.api.devicesCommunitiesLibraryIndex({
      params: { id: deviceId },
    }),
  });
}

export function useCommunitySetList(deviceId: number) {
  return useQuery({
    queryKey: ["communitySets", deviceId],
    queryFn: () => apiClient.api.devicesCommunitySetsList({
      params: { id: deviceId },
    }),
  });
}

export function useCommunityPreview(
  deviceId: number,
  setId: number,
  enabled = false
) {
  return useQuery({
    queryKey: ["communityPreview", deviceId, setId],
    queryFn: () =>
      apiClient.api.devicesCommunitySetPreview({
        params: { id: deviceId, setId },
      }),
    enabled,
  });
}

export function useApplyCommunitySet() {
  return useMutation({
    mutationFn: ({
      deviceId,
      setId,
      request,
    }: {
      deviceId: number;
      setId: number;
      request: CommunityApplyRequest;
    }) =>
      apiClient.api.devicesCommunitySetApply({
        params: { id: deviceId, setId },
        body: request,
      }),
  });
}
```

### 2. Community Library Tab

**File:** `workspace/artifacts/netops-manager/src/features/bgp/community-library-tab.tsx`

- List of community-filters
- Inline edit: description, tags, is_active
- Quick-add form for new filters
- Usage counter showing route-policy references

### 3. Community Sets Tab

**File:** `workspace/artifacts/netops-manager/src/features/bgp/community-sets-tab.tsx`

- List of community-list sets with member counts
- Add set button (modal: name, slug, vrp_object_name)
- Edit set (inline or modal)
- Preview button → shows candidate config + warnings
- Apply button (confirmation modal)
- Delete set

### 4. Integration in Device Detail

**File:** `workspace/artifacts/netops-manager/src/pages/device-detail.tsx`

Add two new tabs after BGP:
- "Community Filters" → `<CommunityLibraryTab />`
- "Community Sets" → `<CommunitySetsTab />`

---

## SSH Commands

Huawei VRP (readOnly whitelist):

```
display running-config | include community-filter
display running-config | include community-list
display running-config | section route-policy
```

For apply (config mode):
```
system-view
[system-view] ip community-list <name>
[system-view] community <value>
[system-view] quit
```

---

## Migration Path

### Phase 1 (MVP):
1. Add schema + models to Drizzle
2. Port parser (community-filter + community-list)
3. Integrate with device discovery snapshot
4. Simple frontend tabs (read-only list)

### Phase 2:
5. Apply service + SSH deployment
6. Preview modal with warning system
7. Edit UI + inline editing
8. Audit trail

### Phase 3:
9. Route-policy reference visualization
10. Comparison tool (compare two sets)
11. Clone/bulk operations
12. Advanced validation

---

## Testing

### Backend Smoke Tests:
```bash
# Parse running-config extract
curl -X POST http://localhost:5000/api/devices/1/communities/sync

# List library items
curl -X GET http://localhost:5000/api/devices/1/communities/library

# List sets
curl -X GET http://localhost:5000/api/devices/1/community-sets

# Preview candidate config
curl -X POST http://localhost:5000/api/devices/1/community-sets/1/preview

# Apply (requires approval)
curl -X POST http://localhost:5000/api/devices/1/community-sets/1/apply \
  -d '{"confirm":true,"expectedCandidateSha256":"...","acknowledgeMissingLibraryRefs":false}'
```

### Frontend Manual Tests:
1. Device detail → Communities tab → see library items
2. Communities tab → add filter
3. Community Sets tab → create set
4. Edit set members
5. Preview config
6. Apply (mock)

---

## Dependencies & Build

No new npm packages needed (use existing zod + drizzle + react-query).

Regenerate:
```bash
cd workspace
pnpm --filter @workspace/api-spec run codegen
pnpm typecheck
```

---

## Files to Create/Modify

### Create:
1. `workspace/lib/db/src/schema/community.ts` (Drizzle schema)
2. `workspace/lib/api-zod/src/generated/types/communityLibraryItem.ts`
3. `workspace/lib/api-zod/src/generated/types/communitySet.ts`
4. `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/community-parser.ts`
5. `workspace/artifacts/api-server/src/modules/netops/device-discovery/services/community-discovery.service.ts`
6. `workspace/artifacts/api-server/src/modules/netops/device-discovery/services/community-apply.service.ts`
7. `workspace/artifacts/api-server/src/modules/netops/device-discovery/community.routes.ts`
8. `workspace/artifacts/netops-manager/src/features/device-discovery/community-api.ts`
9. `workspace/artifacts/netops-manager/src/features/bgp/community-library-tab.tsx`
10. `workspace/artifacts/netops-manager/src/features/bgp/community-sets-tab.tsx`

### Modify:
1. `workspace/lib/db/src/schema/index.ts` (export community tables)
2. `workspace/lib/api-spec/openapi.yaml` (add schemas + paths)
3. `workspace/artifacts/api-server/src/modules/netops/device-discovery/discovery-api.types.ts` (add to DiscoverySnapshot)
4. `workspace/artifacts/api-server/src/modules/netops/device-discovery/discovery.routes.ts` (import community routes)
5. `workspace/artifacts/netops-manager/src/pages/device-detail.tsx` (add community tabs)
6. `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/commands.ts` (whitelist community commands)

---

## Next: Immediate Steps

1. Create schema + migrations
2. Port parser from Python
3. Integrate discovery collection
4. Basic frontend UI (read-only tabs)
5. Test end-to-end with real device data
