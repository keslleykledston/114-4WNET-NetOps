# Audit Center — Activity Logging & Compliance

**Version:** v0.3.6  
**Date:** 2026-05-23  
**Status:** In Development

---

## Overview

Audit Center provides operational staff with a dedicated interface for viewing, filtering, exporting, and analyzing system activity logs. Supports troubleshooting, security auditing, and compliance reporting.

---

## Features

### 1. Audit Summary Dashboard

**Endpoint:** `GET /api/audit-logs/summary`

Returns high-level audit statistics:

```json
{
  "total": 2847,
  "last24h": 342,
  "byAction": {
    "test_connectivity": 156,
    "device_discovery_start": 89,
    "compliance_job_run": 67,
    "compliance_report_download": 45,
    "device_update": 34,
    "user_login": 28,
    "user_logout": 28,
    "device_import": 12,
    "user_disable": 2,
    "login_failed": 5
  },
  "byActor": {
    "admin@example.com": 1200,
    "operator@netops.local": 892,
    "viewer@test.local": 453,
    "integration_service": 302
  },
  "byObjectType": {
    "device": 1800,
    "user": 450,
    "compliance_job": 350,
    "import_session": 247
  },
  "sensitiveEvents": [
    {
      "event": "login_failed",
      "count": 5,
      "lastOccurrence": "2026-05-23T09:15:00Z",
      "actors": ["unknown@external.com"]
    },
    {
      "event": "user_disabled",
      "count": 2,
      "lastOccurrence": "2026-05-22T14:30:00Z",
      "actors": ["admin@example.com"]
    }
  ],
  "alertThresholds": {
    "failedLogins": "5+ in 10min",
    "unusualExports": "> 10 in 1hour",
    "sensitiveChanges": "Any user_disable, password_reset"
  }
}
```

### 2. Advanced Audit Log Filtering

**Endpoint:** `GET /api/audit-logs` (enhanced)

**Query Parameters:**

```
GET /api/audit-logs?actorId=50&action=compliance_job_run&dateFrom=2026-05-20&dateTo=2026-05-23&severity=high&limit=50&cursor=...
```

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| actorId | integer | Filter by user ID | 50 |
| actor | string | Filter by email (partial) | admin@example.com |
| action | string | Filter by event type | test_connectivity, compliance_job_run |
| objectType | string | Resource type | device, user, compliance_job |
| objectId | integer | Resource ID | 1 (device id) |
| sourceIp | string | Source IP address | 192.168.1.100 |
| dateFrom | ISO8601 | Start date | 2026-05-20 |
| dateTo | ISO8601 | End date | 2026-05-23 |
| severity | string | Event severity | info, operational, security, admin |
| limit | integer | Results per page | 50 (default), max 500 |
| cursor | string | Pagination cursor | opaque_cursor_token |

**Response:**

```json
{
  "events": [
    {
      "id": 1234,
      "timestamp": "2026-05-23T10:30:45Z",
      "event": "compliance_job_run",
      "severity": "operational",
      "actor": {
        "id": 50,
        "email": "admin@example.com",
        "role": "admin"
      },
      "resource": {
        "type": "compliance_job",
        "id": 48,
        "metadata": {
          "deviceId": 1,
          "profile": "edge-balanced"
        }
      },
      "result": "success",
      "sourceIp": "127.0.0.1",
      "userAgent": "Mozilla/5.0...",
      "details": "Job completed with 12 findings"
    }
  ],
  "pagination": {
    "total": 342,
    "limit": 50,
    "cursor": "next_page_token",
    "hasMore": true
  }
}
```

### 3. Event Severity Classification

Events classified by impact and audience:

#### Info Events
- `interface_discovered`
- `bgp_peer_discovered`
- `config_collected`
- Audience: NOC/operator

#### Operational Events
- `test_connectivity`
- `device_discovery_start`
- `device_discovery_complete`
- `compliance_job_run`
- `compliance_job_complete`
- `report_downloaded`
- Audience: NOC/operator

#### Security Events
- `login_failed`
- `unauthorized_access`
- `permission_denied`
- `integration_token_created`
- `integration_token_revoked`
- Audience: Admin, security team

#### Admin Events
- `user_created`
- `user_updated`
- `user_disabled`
- `user_enabled`
- `password_reset`
- `session_revoked`
- `role_changed`
- Audience: Admin

#### Export Events
- `device_export_started`
- `device_export_completed`
- `compliance_report_download`
- `audit_export_requested`
- Audience: Admin, compliance

#### Failed Events
- `login_failed`
- `ssh_connection_failed`
- `snmp_connection_failed`
- `discovery_failed`
- `compliance_job_failed`
- `export_failed`
- Audience: NOC/operator for troubleshooting

### 4. Sensitive Events Tracking

Flagged for enhanced monitoring:

```typescript
const sensitiveEvents = [
  "login_failed",          // Failed auth attempt
  "user_disabled",         // Account deactivation
  "password_reset",        // Credential reset
  "session_revoked",       // Session termination
  "integration_changed",   // Integration config change
  "export_downloaded",     // Bulk data export
  "unauthorized_access",   // Permission denial
];
```

Alert if:
- 5+ failed login in 10 minutes
- Any user_disabled event
- Any password_reset (audit for legitimacy)
- Any session_revoked from other admin
- Any integration_token_created (track who)
- Any export_downloaded of sensitive data

### 5. Data Sanitization

Never expose:
- Password hashes
- API tokens
- SSH session details
- SNMP community strings
- Device credentials
- Evidence payloads (raw)

Safe to expose:
- Device hostname, IP, role
- User email, role, action
- Event type, timestamp
- Finding summaries (no raw evidence)
- BGP communities (not credentials)

---

## UI: Audit Center Page

**Path:** `/audit-center`

**Permissions:**
- Viewer: READ-ONLY if has `audit.read` permission
- Operator: READ-ONLY, filtered to operational events
- Admin: FULL access (read, export, alerts)

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│ Audit Center — Activity & Compliance Logging            │
└─────────────────────────────────────────────────────────┘

[Summary Cards]
  Total Events: 2,847  |  Last 24h: 342  |  Failed Logins: 5  |  Exports: 12

[Filters Sidebar]                [Timeline/Table]
  Date Range:                      Date        Actor      Action           Object    Result
  [From]  [To]                     ────────────────────────────────────────────────
  
  Actor:                           2026-05-23  admin@ex   compliance_job   job#48    ✓
  [Dropdown search]                           run
                                  2026-05-23  admin@ex   device_update    dev#1     ✓
  Action:
  [Dropdown]                       2026-05-23  operator   test_conn        dev#3     ✓
  [x] test_connectivity
  [x] device_discovery            2026-05-22  admin@ex   user_disabled    user#54   ✓
  [x] compliance_job_run           (SENSITIVE)
  [ ] login_failed
                                  [Previous]  [1-50]  [Next]
  Severity:
  [ ] Info
  [x] Operational                  [Export CSV] [Export JSON] [Alert Settings]
  [x] Security
  [x] Admin
  [x] Failed
  
  [Apply] [Reset]
```

**Modal: Event Details**

```
┌─────────────────────────────────────────────────────────┐
│ Event Details — Compliance Job Run                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Timestamp:    2026-05-23 10:30:45 UTC                │
│  Event Type:   compliance_job_run                      │
│  Severity:     OPERATIONAL                            │
│  Actor:        admin@example.com (Admin)              │
│  Source IP:    127.0.0.1                              │
│  User Agent:   Mozilla/5.0 (Windows NT 10.0)          │
│                                                         │
│  Resource:                                             │
│    Type:       compliance_job                          │
│    ID:         48                                      │
│    Device:     4WNET-BVA-BRT-RX (device#1)           │
│    Profile:    edge-balanced                          │
│                                                         │
│  Result:       SUCCESS                                 │
│  Details:      Job completed with 12 findings         │
│                 5 failures, 7 passes                   │
│                                                         │
│  [Close]
└─────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Summary

```
GET /api/audit-logs/summary
  → Returns: total, byAction, byActor, byObjectType, sensitiveEvents, alertThresholds
  Permission: audit.read
  Response: 200 OK
```

### List with Filters

```
GET /api/audit-logs?actorId=50&action=compliance_job_run&limit=50
  → Returns: array of events, pagination info
  Permission: audit.read
  Response: 200 OK
  Filter combinations: AND logic
```

### Export

```
GET /api/audit-logs/export?format=[csv|json]&filters=...
  → Returns: file download
  Permission: audit.export (admin-only by default)
  Response: 200 OK with file, Content-Disposition header
  Sanitization: ENABLED (no secrets in export)
```

### Alert Configuration

```
POST /api/audit-logs/alerts (future v0.3.7)
  → Configure threshold alerts
  Permission: audit.admin
  Body: { eventType, threshold, window, action }
```

---

## Audit Event Examples

### Operational: Compliance Job Run

```json
{
  "event": "compliance_job_run",
  "severity": "operational",
  "actor": { "id": 50, "email": "admin@example.com" },
  "resource": {
    "type": "compliance_job",
    "id": 48,
    "metadata": {
      "deviceId": 1,
      "deviceHostname": "4WNET-BVA-BRT-RX",
      "profileName": "edge-balanced",
      "findingsCount": 12
    }
  },
  "result": "success",
  "timestamp": "2026-05-23T10:30:45Z"
}
```

### Security: Failed Login

```json
{
  "event": "login_failed",
  "severity": "security",
  "actor": { "email": "unknown@external.com" },
  "resource": { "type": "auth_attempt" },
  "result": "failure",
  "details": "Invalid credentials",
  "sourceIp": "203.0.113.5",
  "timestamp": "2026-05-23T09:15:00Z"
}
```

### Admin: User Disabled

```json
{
  "event": "user_disabled",
  "severity": "admin",
  "actor": { "id": 1, "email": "admin@example.com" },
  "resource": {
    "type": "user",
    "id": 54,
    "metadata": { "userEmail": "test@example.com", "reason": "Account locked" }
  },
  "result": "success",
  "timestamp": "2026-05-22T14:30:00Z"
}
```

### Export: Report Downloaded

```json
{
  "event": "compliance_report_download",
  "severity": "export",
  "actor": { "id": 50, "email": "admin@example.com" },
  "resource": {
    "type": "compliance_job",
    "id": 48,
    "metadata": {
      "format": "markdown",
      "deviceId": 1,
      "findingsCount": 12
    }
  },
  "result": "success",
  "timestamp": "2026-05-23T10:45:00Z"
}
```

---

## Permission Model

| Role | audit.read | audit.export | audit.admin |
|------|-----------|--------------|------------|
| Viewer | if granted | ✗ | ✗ |
| Operator | ✓ | ✗ | ✗ |
| Admin | ✓ | ✓ | ✓ |

**Filtering Rules:**
- Viewer: Only sees events affecting resources they can access (future: resource-level ACL)
- Operator: Sees operational events (test_conn, discovery, compliance, export)
- Admin: Sees all events including security, admin, sensitive

---

## Compliance & Retention

### Data Retention Policy (future v0.3.7)

- Audit logs retained for **90 days** (configurable)
- After 90 days: auto-archive to cold storage
- Legal hold: manual preservation

### Export for Compliance

```
Audit Center → [Export CSV] → includes:
- All events in date range
- No sanitization (internal use)
- CSV columns: timestamp, actor, action, object, result, IP, details
```

Exported for:
- SOC2 reporting
- Incident investigation
- Forensics
- Compliance audits

---

## References

- Audit Schema: `workspace/lib/db/src/schema/audit.ts`
- Audit Routes: `workspace/artifacts/api-server/src/routes/audit.ts`
- Audit Service: `workspace/artifacts/api-server/src/modules/audit/`

---

**Status:** ✅ Specification Complete
