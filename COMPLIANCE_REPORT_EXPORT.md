# Compliance Report Export — Feature Documentation

**Feature:** v0.3.3 Compliance Report Download  
**Status:** ✅ Production  
**Formats:** Markdown, JSON, CSV  
**Permission:** compliance.export (operator+)

---

## Overview

Compliance Report Export provides automated, sanitized download of compliance findings and reports in multiple formats. Users can export job reports, filtered findings, or aggregated groups with full transparency and security.

### Use Cases

1. **Report Generation:** Create markdown reports for auditing/documentation
2. **Data Exchange:** Export findings as JSON/CSV for external tools (SIEM, spreadsheets)
3. **Group Analysis:** Aggregate findings by rule, severity, policy for trend analysis
4. **Compliance Evidence:** Sanitized reports for compliance reviews (passwords/tokens removed)

---

## API Endpoints

### 1. Job Report Download
**Endpoint:** `GET /api/compliance/jobs/:id/report/download`

Download a compliance report for a specific job in Markdown, JSON, or CSV format.

**Parameters:**
```
jobId (path, required): integer
format (query, required): "markdown" | "json" | "csv"
status (query, optional): "pass" | "fail"
severity (query, optional): "critical" | "high" | "medium" | "low"
context (query, optional): string (e.g., "bgp-policy")
source (query, optional): string (e.g., "ssh")
confidence (query, optional): "high" | "medium" | "low"
operationalCategory (query, optional): string (e.g., "routing")
freshness (query, optional): "fresh" | "stale"
```

**Example Request:**
```bash
# Markdown report (all findings)
curl -H "Cookie: session=..." \
  "http://localhost:8085/api/compliance/jobs/48/report/download?format=markdown"

# JSON report (only failures)
curl -H "Cookie: session=..." \
  "http://localhost:8085/api/compliance/jobs/48/report/download?format=json&status=fail"

# CSV report (critical severity only)
curl -H "Cookie: session=..." \
  "http://localhost:8085/api/compliance/jobs/48/report/download?format=csv&severity=critical"
```

**Response Headers:**
```
Content-Type: text/markdown; charset=utf-8
                OR application/json
                OR text/csv; charset=utf-8
Content-Disposition: attachment; filename="compliance-job-48-2026-05-22.md"
```

**Response Body:**

*Markdown:*
```markdown
# Compliance Report — Device: example-router

## Summary
- **Total Findings:** 42
- **Pass:** 30
- **Fail:** 12
- **Policy Profile:** BGP Routing Compliance v2

### By Status
| Status | Count |
|--------|-------|
| pass   | 30    |
| fail   | 12    |

### By Severity
| Severity | Count |
|----------|-------|
| high     | 8     |
| medium   | 4     |

[Additional summary tables...]

## Finding Groups
| Rule ID | Rule Name | Count | Sample IDs |
|---------|-----------|-------|-----------|
| bgp-001 | BGP MED Validation | 3 | 1, 2, 3 |

## Findings
| ID | Status | Severity | Rule | Object | Message |
|----|--------|----------|------|--------|---------|
| 1 | fail | high | bgp-001 | peer-172.28.1.13 | MED value exceeds policy max |

## Sanitization
**Enabled:** Yes  
**Patterns Applied:** password, token, secret, session, cookie, authorization

---
*Report generated: 2026-05-22T10:30:45Z*
```

*JSON:*
```json
{
  "metadata": {
    "jobId": 48,
    "deviceId": 1,
    "deviceHostname": "example-router",
    "policyProfileName": "BGP Routing Compliance v2",
    "status": "completed",
    "startedAt": "2026-05-22T10:00:00Z",
    "completedAt": "2026-05-22T10:05:30Z",
    "generatedAt": "2026-05-22T10:30:45Z",
    "generatedBy": "system"
  },
  "summary": {
    "totalFindings": 42,
    "passCount": 30,
    "failCount": 12,
    "byStatus": {"pass": 30, "fail": 12},
    "bySeverity": {"high": 8, "medium": 4},
    "byOperationalCategory": {"routing": 10, "security": 2},
    "byFreshness": {"fresh": 40, "stale": 2},
    "bySourceConfidence": {"ssh/high": 40, "netbox/medium": 2}
  },
  "findings": [
    {
      "id": 1,
      "jobId": 48,
      "deviceId": 1,
      "deviceHostname": "example-router",
      "status": "fail",
      "severity": "high",
      "context": "bgp-policy",
      "operationalCategory": "routing",
      "freshness": "fresh",
      "source": "ssh",
      "confidence": "high",
      "ruleId": "bgp-001",
      "ruleName": "BGP MED Validation",
      "objectType": "bgp-peer",
      "objectName": "peer-172.28.1.13",
      "message": "MED value exceeds policy max (100 > 50)",
      "recommendation": "Adjust MED value to comply with policy",
      "evidenceSanitized": "MED: 100, Policy Max: 50",
      "createdAt": "1"
    }
  ],
  "groups": [
    {
      "ruleId": "bgp-001",
      "ruleName": "BGP MED Validation",
      "policyName": "BGP Routing Compliance v2",
      "context": "bgp-policy",
      "severity": "high",
      "operationalCategory": "routing",
      "freshness": "fresh",
      "message": "MED value validation",
      "count": 3,
      "sampleFindingIds": [1, 2, 3]
    }
  ],
  "sanitization": {
    "enabled": true,
    "rulesApplied": ["password", "token", "secret", "session", "cookie"]
  },
  "filters": {
    "status": "fail",
    "severity": "high"
  }
}
```

*CSV (Findings):*
```csv
jobId,deviceId,deviceHostname,status,severity,context,operationalCategory,freshness,source,confidence,ruleId,ruleName,objectType,objectName,message,recommendation,createdAt
48,1,example-router,fail,high,bgp-policy,routing,fresh,ssh,high,bgp-001,BGP MED Validation,bgp-peer,peer-172.28.1.13,MED value exceeds policy max (100 > 50),Adjust MED value to comply with policy,1
```

---

### 2. Findings Export
**Endpoint:** `GET /api/compliance/findings/export`

Export all findings across all jobs (paginated or full).

**Parameters:**
```
format (query, required): "csv" | "json"
status (query, optional): "pass" | "fail"
severity (query, optional): "critical" | "high" | "medium" | "low"
```

**Example Request:**
```bash
curl -H "Cookie: session=..." \
  "http://localhost:8085/api/compliance/findings/export?format=csv&status=fail"
```

**Response:** CSV or JSON with all filtered findings, grouped by device

---

### 3. Groups Export
**Endpoint:** `GET /api/compliance/findings/groups/export`

Export aggregated findings grouped by rule, policy, context, severity, freshness.

**Parameters:**
```
format (query, required): "csv" | "json"
```

**Example Request:**
```bash
curl -H "Cookie: session=..." \
  "http://localhost:8085/api/compliance/findings/groups/export?format=csv"
```

**Response:** CSV or JSON with aggregated groups showing count and sample finding IDs

---

## Evidence Sanitization

All exported evidence is **automatically sanitized** to remove secrets while preserving technical content.

### Patterns Masked
| Pattern | Example | Masked |
|---------|---------|--------|
| password | `password: abc123` | `password: ***` |
| token | `token: eyJhbCi...` | `token: ***` |
| secret | `secret: s3cr3t` | `secret: ***` |
| session | `session_id: xyz` | `session_id: ***` |
| authorization | `Authorization: Bearer xxx` | `Authorization: ***` |
| cookie | `Cookie: sid=abc` | `Cookie: ***` |
| snmp-community | `community: public-ro` | `community: ***` |

### Patterns Preserved (NOT Masked)
| Pattern | Example | Preserved |
|---------|---------|-----------|
| BGP Community | `65001:100` | `65001:100` ✓ |
| AS Path | `65001 65002` | `65001 65002` ✓ |
| IP Addresses | `192.168.1.1` | `192.168.1.1` ✓ |
| Prefixes | `10.0.0.0/8` | `10.0.0.0/8` ✓ |
| Interface Names | `Ge-0/0/0` | `Ge-0/0/0` ✓ |

### Sanitization in Reports
Each exported report includes a sanitization notice:
```
Sanitization Applied: Yes
Patterns Masked: password, token, secret, session
```

---

## Permission Model

Access to compliance exports requires the **`compliance.export`** permission.

### Role Defaults
```
Admin:     compliance.export = true
Operator:  compliance.export = true
Viewer:    compliance.export = false
```

**Permission Check:**
```typescript
@middleware(requirePermission("compliance.export"))
async function postComplianceJobReportDownload(req, res) { ... }
```

**Error Response (403):**
```json
{
  "status": 403,
  "error": "Permission denied: compliance.export"
}
```

---

## Audit Logging

Every export creates an audit log entry with:
- **Event:** `compliance_report_download` | `compliance_findings_export` | `compliance_groups_export`
- **Actor:** User ID, email
- **Resource:** Job ID, format, filters applied
- **Timestamp:** ISO 8601
- **Sanitized:** No secrets in logs

**Audit Log Entry:**
```json
{
  "id": 1234,
  "event": "compliance_report_download",
  "userId": 50,
  "userEmail": "admin@example.com",
  "resource": {
    "type": "compliance_job",
    "id": 48,
    "format": "markdown",
    "filters": {"status": "fail"}
  },
  "result": "success",
  "timestamp": "2026-05-22T10:30:45Z",
  "ipAddress": "127.0.0.1",
  "userAgent": "curl/7.85.0"
}
```

---

## Frontend Integration

### Compliance Page
Located: `workspace/artifacts/netops-manager/src/pages/compliance.tsx`

**Download Button:**
- Icon: Download (lucide-react)
- Location: Job actions column
- Behavior: Navigates to `/api/compliance/jobs/{jobId}/report/download?format=markdown`
- Permission: Visible only to users with compliance.export

**Usage Flow:**
1. Open Compliance page
2. Find job in Jobs table
3. Click Download icon
4. Browser downloads markdown file (compliance-job-{jobId}-{date}.md)
5. User can manually edit URL to change format (`?format=json` or `?format=csv`)

### Query Filters (Future)
The frontend can be extended to support filter dropdowns:
```
Filter by:
  - Status: All / Pass / Fail
  - Severity: All / Critical / High / Medium / Low
  - Context: All / bgp-policy / interface-mtu / ...
```

These map to query parameters:
```
/api/compliance/jobs/48/report/download?format=markdown&status=fail&severity=high
```

---

## Data Structures

### ComplianceReportFinding
```typescript
interface ComplianceReportFinding {
  id: number;
  jobId: number;
  deviceId: number;
  deviceHostname: string;
  status: "pass" | "fail" | "unknown";
  severity: "critical" | "high" | "medium" | "low";
  context: string;
  operationalCategory: string;
  freshness: "fresh" | "stale";
  source: string;
  confidence: "high" | "medium" | "low";
  ruleId: string;
  ruleName: string;
  objectType: string;
  objectName: string;
  message: string;
  recommendation: string;
  evidenceSanitized?: string;
  createdAt: string;
}
```

### ComplianceReportGroup
```typescript
interface ComplianceReportGroup {
  ruleId: string;
  ruleName: string;
  policyName: string;
  context: string;
  severity: string;
  operationalCategory: string;
  freshness: string;
  message: string;
  count: number;
  sampleFindingIds: number[];
}
```

### ComplianceReportJson
```typescript
interface ComplianceReportJson {
  metadata: ComplianceReportMetadata;
  summary: ComplianceReportSummary;
  filters: ComplianceReportFilters;
  findings: ComplianceReportFinding[];
  groups: ComplianceReportGroup[];
  sanitization: {
    enabled: boolean;
    rulesApplied: string[];
  };
}
```

---

## Usage Examples

### Example 1: Export all failures for compliance review
```bash
# Download markdown report with only failures
curl -H "Cookie: session=abc123..." \
  -o compliance-report.md \
  "http://localhost:8085/api/compliance/jobs/48/report/download?format=markdown&status=fail"

# Open in editor and share with team
cat compliance-report.md
```

### Example 2: Export findings to spreadsheet
```bash
# Download CSV for all findings
curl -H "Cookie: session=abc123..." \
  -o findings.csv \
  "http://localhost:8085/api/compliance/findings/export?format=csv"

# Import into Excel/Google Sheets
```

### Example 3: Analyze trends by rule
```bash
# Export aggregated groups
curl -H "Cookie: session=abc123..." \
  -o groups.json \
  "http://localhost:8085/api/compliance/findings/groups/export?format=json" | \
  jq '.[] | select(.count > 5) | {ruleId, ruleName, count}'
```

### Example 4: Automated compliance check
```bash
# Script: Export and verify no critical findings
curl -s -H "Cookie: session=..." \
  "http://localhost:8085/api/compliance/jobs/48/report/download?format=json&severity=critical" | \
  jq '.summary.totalFindings' > critical_count.txt

if [ $(cat critical_count.txt) -eq 0 ]; then
  echo "✓ No critical findings"
  exit 0
else
  echo "✗ Critical findings present"
  exit 1
fi
```

---

## Security Considerations

### Secret Exposure Prevention
- ✅ Evidence sanitization active on all exports
- ✅ Audit logs sanitized (no plaintext secrets)
- ✅ RBAC enforces permission checks
- ✅ No default/debug endpoints leaking data

### HTTPS in Production
- ✅ All endpoints require HTTPS in production
- ✅ Cookies flagged Secure, HttpOnly, SameSite=Strict
- ✅ CORS properly configured
- ✅ Content-Security-Policy headers set

### Rate Limiting (Future)
- Not yet implemented
- Recommended: max 100 requests/minute per user
- Prevents abuse/DoS via export endpoints

---

## Troubleshooting

### Permission Denied (403)
```json
{"status": 403, "error": "Permission denied: compliance.export"}
```
**Solution:** User role must be Admin or Operator, or have explicit compliance.export permission.

### Job Not Found (404)
```json
{"status": 404, "error": "Job not found"}
```
**Solution:** Verify job ID exists and is owned by correct device.

### Invalid Format
```json
{"status": 400, "error": "Invalid format. Must be: markdown|json|csv"}
```
**Solution:** Use valid format parameter.

### Empty Report
**Cause:** No findings match filters  
**Solution:** Try with fewer filters or check job status

### Large File Warning
**Cause:** Report > 100MB (rare, but possible with 10k+ findings)  
**Solution:** Use filters to scope findings, or export groups instead

---

## Performance

### Report Generation Time
| Size | Findings | Time | Notes |
|------|----------|------|-------|
| XS | < 10 | < 50ms | Trivial |
| S | 10-100 | < 150ms | Fast |
| M | 100-1k | < 500ms | Normal |
| L | 1k-10k | < 2s | Acceptable |
| XL | 10k+ | > 5s | Consider filtering |

### Optimization Tips
1. **Use filters** to reduce findings count
2. **Export groups** instead of all findings for analysis
3. **Stagger exports** if running in bulk scripts
4. **Cache results** at application level (future feature)

---

## Future Enhancements

### v0.3.4 (Planned)
- [ ] Streaming response for large exports (no memory limit)
- [ ] Email delivery of reports
- [ ] Scheduled/automated exports
- [ ] Excel (XLSX) format support
- [ ] Custom report templates

### v0.3.5+
- [ ] Resource-level ACL (export only owned jobs)
- [ ] Export history and audit trail UI
- [ ] Bulk export with watermarking
- [ ] Integration with external storage (S3, GCS)

---

## References

- **API Spec:** `workspace/lib/api-spec/openapi.yaml`
- **Types:** `workspace/artifacts/api-server/src/modules/compliance/report-export/compliance-report-export.types.ts`
- **Service:** `workspace/artifacts/api-server/src/modules/compliance/report-export/compliance-report-export.service.ts`
- **Routes:** `workspace/artifacts/api-server/src/routes/compliance.ts`
- **Tests:** `tools/compliance-report-download-selftest.mjs`

---

**Last Updated:** 2026-05-22  
**Version:** v0.3.3  
**Status:** ✅ Production Ready
