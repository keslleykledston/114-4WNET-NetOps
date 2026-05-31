# Config Diff UI — Advanced History Visualization

## Overview

Device config versioning + diff visualization. Track config changes, compare versions, audit trail.

## Features

### 1. Config History List
**Page:** Device Detail → Config Tab

**Displays per device:**
- Collection timestamp (most recent first)
- Source: `connector_ssh_bundle`, `ssh` (manual), `scheduled`
- Config size (bytes)
- SHA-256 hash (first 12 chars)
- Parser status: SUCCESS, PARTIAL, FAILED
- Actions: View Raw, Download, Compare

**API:** `GET /api/devices/:id/config-history` → max 200 configs

### 2. Raw Config Viewer
**Action:** View Raw button on history row

**Shows:**
- Full raw config in monospace font
- Line numbers
- Copy-to-clipboard button
- Download button

**API:** `GET /api/configs/:id` → returns raw_config field

**⚠️ Security note:** Raw configs may contain sensitive data (passwords, SNMP communities). Download restricted to authenticated users. Audit logged.

### 3. Config Diff Visualization
**Action:** Compare button on history row

**Compares:**
- Selected config vs. previous version
- Line-by-line unified diff format
- Color-coded:
  - Green (`+`) — Added lines
  - Red (`-`) — Removed lines
  - Gray — Unchanged lines
- Side-by-side view (optional, future enhancement)

**Diff summary:**
- Shows line counts: `+X -Y unchanged Z`
- Shows hash change: previous hash → current hash
- Diff cache: stored in `config_diffs` table, generated on-demand if missing

**API:** `GET /api/configs/:id/diff` → returns diff_text + diff_summary

### 4. Config Download
**Action:** Download button on history row

**File format:**
- Name: `{hostname}-config-{configId}-{timestamp}.txt`
- Content: Raw config text
- Type: `text/plain; charset=utf-8`

**Flow:**
1. Click Download
2. Browser fetches `GET /api/configs/:id`
3. Client-side Blob creation
4. Automatic file download

**API:** `GET /api/configs/:id` (no special download endpoint)

## Filtering & Sorting

**Current:**
- Sorted by collected_at DESC (most recent first)
- Max 200 configs returned

**Future enhancements:**
- Filter by source (ssh_bundle, manual, scheduled)
- Filter by parser status (SUCCESS, PARTIAL, FAILED)
- Search by hash or date range
- Pagination for > 200 configs

## Collection Triggers

**Three ways configs are collected:**

| Trigger | Source | Job Type | User Interaction |
|---------|--------|----------|------------------|
| Manual SSH | `ssh` | Direct SSH command | Click "Collect Now" button |
| Connector Agent | `connector_ssh_bundle` | SSH_CONFIG_BUNDLE job | Automatic (scheduled) or manual |
| Discovery | `discovery_run` | SSH execution in discovery flow | Automatic (discovery scheduled) |

## Data Flow

```
Config Collection
    ↓
INSERT into collected_configs (raw_config, source, parser_status=PENDING)
    ↓
Auto-generate diff (if not exists):
    Find previous config for same device
    Run LCS algorithm (line-by-line)
    INSERT into config_diffs
    ↓
Async parse (if enabled):
    Parse BGP, L2VPN, interfaces, VLANs
    Update parser_status + parsed_* fields
    ↓
UI queries:
    GET /devices/:id/config-history → List
    GET /configs/:id → Detail + raw_config
    GET /configs/:id/diff → Diff viewer
```

## API Reference

### List Device Config History
```
GET /api/devices/:id/config-history?limit=200
```

**Response:**
```json
{
  "configs": [
    {
      "id": 42,
      "device_id": 10,
      "source": "connector_ssh_bundle",
      "size_bytes": 8192,
      "hash": "abc123...",
      "parser_status": "SUCCESS",
      "parser_error": null,
      "collected_at": "2026-05-31T14:30:00Z",
      "diff_id": 99,
      "previous_config_id": 41
    }
  ],
  "total": 125
}
```

### Get Config Detail
```
GET /api/configs/:id
```

**Response:**
```json
{
  "id": 42,
  "device_id": 10,
  "device_hostname": "device1",
  "source": "connector_ssh_bundle",
  "raw_config": "# Huawei Configuration\n...",
  "size_bytes": 8192,
  "hash": "abc123...",
  "parser_status": "SUCCESS",
  "collected_at": "2026-05-31T14:30:00Z",
  "parsed_vlans": [...],
  "parsed_interfaces": [...],
  "parsed_bgp": [...]
}
```

### Get Config Diff
```
GET /api/configs/:id/diff
```

**Response:**
```json
{
  "config_id": 42,
  "previous_config_id": 41,
  "diff_summary": "+12 -5 unchanged 1024",
  "diff_text": "+ permit tcp any any eq 22\n- permit tcp any any eq 23\n  permit tcp any any eq 443",
  "created_at": "2026-05-31T14:30:05Z"
}
```

### Compare Two Configs (Future)
```
POST /api/configs/compare
{
  "config_id_1": 41,
  "config_id_2": 42
}
```

**Response:**
```json
{
  "config_1": {...},
  "config_2": {...},
  "diff": {...}
}
```

## Security Considerations

### ⚠️ Raw Config Exposure
**Current behavior:** `raw_config` returned **without masking** in API responses.

**Risk:** Passwords, SNMP communities, pre-shared keys may appear in raw config text.

**Mitigations:**
1. **Access Control:** Only authenticated users can view configs (session auth required)
2. **Audit Logging:** All config access logged with actor ID + timestamp
3. **UI Warning:** "This config may contain sensitive data" banner
4. **Download Only:** Config only accessible via authenticated API (no public URLs)

### Diff Masking
**Current:** Diffs generated from raw (unmasked) configs. Diffs may show sensitive changes.

**Recommendation:** Apply same masking rules as compliance reports:
- Mask `password`, `community`, `token`, `secret` assignments
- Preserve BGP community values (e.g., `65000:100`)

### Audit Trail
All config operations logged:
- `collect_config` — Config collection
- `config_diff_created` — Diff generation (with summary metadata)

## UI Patterns

### Config History Panel
**Component:** `ConfigHistoryPanel` (config-history-panel.tsx)

**Layout:**
1. Table: Device configs (date, source, size, hash, status, actions)
2. Detail view: Raw config text in `<pre>` block (on-demand)
3. Diff view: Colored lines (green=+, red=-) (on-demand)

**Refresh:** Auto-refresh every 15 seconds (using React Query)

### Color Coding
- **Green** — Added lines (`+ ...`)
- **Red** — Removed lines (`- ...`)
- **Gray** — Unchanged lines (` ...`)

### Line Diff Algorithm
**Algorithm:** Longest Common Subsequence (LCS), O(m*n) complexity
**Input:** Previous and current config (raw text)
**Output:** Unified diff format with line prefixes

## Browser Requirements
- Modern browser (ES6 support)
- Blob API (for file download)
- localStorage (for UI state, optional)

## Performance

| Operation | Expected Duration |
|-----------|---|
| List 200 configs | < 500 ms |
| Load raw config (8 KB) | < 100 ms |
| Generate diff (8 KB config) | < 50 ms |
| Download file (8 KB) | < 100 ms |

## Future Enhancements

1. **Side-by-side diff view** — Columns for before/after
2. **Syntax highlighting** — Code block coloring for device config syntax
3. **Config comparison API** — `POST /configs/compare` endpoint
4. **Filtering** — Source, status, date range
5. **Config annotations** — User comments on config versions
6. **Config rollback** — Revert device to previous config (optional)
7. **Masking in responses** — Filter sensitive data from raw_config output
8. **Compression** — Store configs compressed in DB

## References

- [Collected Configs Schema](../../workspace/lib/db/src/schema/collected_configs.ts)
- [Config History Service](../../workspace/artifacts/api-server/src/modules/config-history/config-history.service.ts)
- [Config History Panel Component](../../workspace/artifacts/netops-manager/src/features/config-history/config-history-panel.tsx)
