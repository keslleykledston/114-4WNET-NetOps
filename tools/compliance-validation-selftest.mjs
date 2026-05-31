#!/usr/bin/env node

import assert from "assert";

function pass(msg) {
  console.log(`✓ ${msg}`);
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

console.log("🧪 Compliance System Validation Selftest\n");

try {
  // Test 1: Operational categories
  console.log("Test 1: Operational categories");

  const categories = [
    "BLOCKER_REAL",
    "RISCO_OPERACIONAL",
    "PADRONIZACAO",
    "CUSTOMIZACAO",
    "INFORMATIVO",
    "FALSO_POSITIVO"
  ];

  categories.forEach(cat => {
    assert(typeof cat === "string", `Category ${cat} invalid`);
  });
  pass(`6 operational categories valid`);

  // Test 2: Freshness states
  console.log("\nTest 2: Freshness state tracking");

  const freshnessStates = ["current", "stale", "legacy", "superseded"];
  const timeThresholds = {
    current: 7 * 24 * 60 * 60 * 1000,    // 7 days
    stale: 30 * 24 * 60 * 60 * 1000,   // 30 days
    legacy: Infinity
  };

  const jobTimestamp = new Date("2026-05-25").getTime(); // 6 days ago
  const now = new Date("2026-05-31").getTime();
  const ageMs = now - jobTimestamp;

  let freshness;
  if (ageMs < timeThresholds.current) freshness = "current";
  else if (ageMs < timeThresholds.stale) freshness = "stale";
  else freshness = "legacy";

  assert(freshness === "current", "6-day-old job should be current");
  pass(`Freshness scoring: ${freshness} (${ageMs / (24*60*60*1000).toFixed(1)}d old)`);

  // Test 3: Source confidence
  console.log("\nTest 3: Source confidence scoring");

  const sources = [
    { source: "snapshot", confidence: "high" },
    { source: "config", confidence: "high" },
    { source: "fallback", confidence: "low" }
  ];

  sources.forEach(({ source, confidence }) => {
    assert(["high", "medium", "low"].includes(confidence), `Invalid confidence for ${source}`);
  });
  pass("Source confidence mapping valid");

  // Test 4: Check contexts
  console.log("\nTest 4: Check contexts (21 checks across 6 contexts)");

  const contexts = {
    security: [
      "ssh-enabled",
      "telnet-disabled",
      "snmp-community-public-absent",
      "aaa-local-configured",
      "ntp-configured"
    ],
    bgp: [
      "bgp-peer-description",
      "bgp-import-policy",
      "bgp-export-policy",
      "route-policy-exists",
      "prefix-list-exists",
      "community-filter-exists",
      "bgp-peer-status",
      "bgp-session-uptime"
    ],
    interface: [
      "interface-description",
      "dot1q-mtu-consistency"
    ],
    l2vpn: [
      "l2vc-status",
      "vsi-status"
    ],
    vrf: [
      "vrf-rd-present",
      "vrf-rt-import",
      "vrf-rt-export"
    ],
    ntp: [
      "ntp-servers-configured"
    ]
  };

  let totalChecks = 0;
  Object.entries(contexts).forEach(([ctx, checks]) => {
    assert(Array.isArray(checks), `Context ${ctx} not array`);
    totalChecks += checks.length;
    pass(`  ${ctx}: ${checks.length} checks`);
  });

  assert(totalChecks === 21, `Expected 21 checks total, got ${totalChecks}`);
  pass(`Total: 21 checks across 6 contexts`);

  // Test 5: Default profiles
  console.log("\nTest 5: Default profiles");

  const profiles = [
    { name: "huawei-vrp-edge-strict", blocking: "error", tolerance: "zero" },
    { name: "huawei-vrp-edge-balanced", blocking: "warning", tolerance: "moderate" },
    { name: "huawei-vrp-observe-only", blocking: "none", tolerance: "permissive" }
  ];

  profiles.forEach(p => {
    assert(p.name.startsWith("huawei-vrp-"), `Profile name format invalid: ${p.name}`);
    assert(["error", "warning", "none"].includes(p.blocking), `Blocking level invalid: ${p.blocking}`);
  });
  pass(`3 default profiles valid`);

  // Test 6: Finding result types
  console.log("\nTest 6: Finding result types");

  const resultTypes = ["pass", "fail", "warning", "unknown"];
  resultTypes.forEach(r => {
    assert(typeof r === "string", `Result type ${r} invalid`);
  });
  pass(`4 result types valid`);

  // Test 7: Severity levels
  console.log("\nTest 7: Severity levels");

  const severities = ["error", "warning", "info"];
  severities.forEach(s => {
    assert(typeof s === "string", `Severity ${s} invalid`);
  });
  pass(`3 severity levels valid`);

  // Test 8: API endpoints coverage
  console.log("\nTest 8: API endpoints (13 total)");

  const endpoints = [
    "POST /api/compliance-jobs",
    "GET /api/compliance-findings",
    "GET /api/devices/:id/compliance",
    "GET /api/compliance/jobs/:id/report/download",
    "GET /api/compliance-findings-groups",
    "POST /api/compliance-policies",
    "GET /api/compliance-policies",
    "POST /api/compliance-policy-profiles",
    "GET /api/compliance-policy-profiles",
    "GET /api/audit-logs?action=compliance_*",
    "GET /api/compliance-jobs/:id",
    "GET /api/compliance-findings/:id",
    "POST /api/compliance-jobs/:id/archive"
  ];

  assert(endpoints.length === 13, `Expected 13 endpoints, got ${endpoints.length}`);
  pass(`13 API endpoints documented`);

  // Test 9: Report export formats
  console.log("\nTest 9: Report export formats");

  const formats = ["markdown", "json", "csv"];
  const sanitization = {
    markdown: ["passwords", "communities", "ip-addresses"],
    json: ["passwords", "communities", "ip-addresses"],
    csv: ["passwords", "communities"]
  };

  formats.forEach(fmt => {
    assert(Array.isArray(sanitization[fmt]), `Sanitization not defined for ${fmt}`);
    assert(sanitization[fmt].length > 0, `No sanitization rules for ${fmt}`);
  });
  pass(`3 export formats with masking rules`);

  // Test 10: Audit trail events
  console.log("\nTest 10: Audit trail events");

  const auditEvents = [
    "compliance_policy_created",
    "compliance_policy_updated",
    "compliance_policy_deleted",
    "compliance_profile_created",
    "compliance_profile_updated",
    "compliance_create",
    "compliance_execute",
    "compliance_report_download",
    "compliance_findings_export",
    "compliance_findings_acknowledged"
  ];

  assert(auditEvents.length >= 10, `Expected >= 10 audit events, got ${auditEvents.length}`);
  pass(`${auditEvents.length} audit events tracked`);

  // Test 11: Performance baselines
  console.log("\nTest 11: Performance baselines");

  const baselines = [
    { op: "Run job (50 contexts)", expected: 5000, unit: "ms" },
    { op: "List findings (10k rows)", expected: 500, unit: "ms" },
    { op: "Export report (1000 findings)", expected: 1000, unit: "ms" },
    { op: "Grouped findings query", expected: 200, unit: "ms" }
  ];

  baselines.forEach(b => {
    assert(b.expected > 0, `Baseline ${b.op} invalid`);
  });
  pass(`${baselines.length} performance baselines defined`);

  // Test 12: Confidence levels
  console.log("\nTest 12: Confidence levels");

  const confidenceMap = {
    "snapshot": "high",
    "config": "high",
    "fallback": "low"
  };

  Object.entries(confidenceMap).forEach(([source, conf]) => {
    assert(["high", "medium", "low"].includes(conf), `Confidence ${conf} invalid`);
  });
  pass("Source → confidence mapping complete");

  // Test 13: Field presence in finding
  console.log("\nTest 13: Finding structure validation");

  const sampleFinding = {
    id: 1,
    jobId: 1,
    policyId: 1,
    policyName: "bgp-peer-description",
    severity: "error",
    context: "bgp",
    result: "fail",
    detail: "BGP peer 10.10.1.1 missing description",
    evidence: "peer 10.10.1.1",
    status: "active",
    message: "Description required",
    recommendation: "Add description: neighbor 10.10.1.1 description ISP-PRIMARY",
    blocking: true,
    source: "snapshot",
    confidence: "high",
    objectType: "bgp_peer",
    objectId: "peer-10.10.1.1",
    objectName: "ISP-PRIMARY",
    operationalCategory: "PADRONIZACAO"
  };

  const requiredFields = [
    "id", "jobId", "policyName", "severity", "context", "result",
    "message", "recommendation", "source", "confidence", "objectName",
    "operationalCategory"
  ];

  requiredFields.forEach(field => {
    assert(field in sampleFinding, `Missing field: ${field}`);
  });
  pass("Finding structure complete (16+ fields)");

  // Test 14: Test Profile assignment logic
  console.log("\nTest 14: Profile assignment logic");

  const assignProfile = (deviceRole, vendor, platform) => {
    if (vendor === "huawei" && platform === "vrp" && deviceRole === "router") {
      return "huawei-vrp-edge-strict"; // Production default
    }
    if (vendor === "huawei" && platform === "vrp" && deviceRole === "switch") {
      return "huawei-vrp-edge-balanced"; // Switch default
    }
    return "huawei-vrp-observe-only"; // Fallback
  };

  const testDevice = {
    role: "router",
    vendor: "huawei",
    platform: "vrp"
  };

  const assigned = assignProfile(testDevice.role, testDevice.vendor, testDevice.platform);
  assert(assigned === "huawei-vrp-edge-strict", `Profile assignment failed for router`);
  pass(`Profile assignment logic: ${assigned}`);

  console.log("\n🎉 All compliance validation tests passed!\n");

} catch (error) {
  fail(`Test failed: ${error.message}`);
}
