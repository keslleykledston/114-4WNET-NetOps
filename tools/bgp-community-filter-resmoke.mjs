#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxBin = path.join(rootDir, "workspace/artifacts/netops-manager/node_modules/.bin/tsx");
const tempDir = mkdtempSync(path.join(tmpdir(), "netops-bgp-community-resmoke-"));
const reportPath = path.join(rootDir, "reports/compliance/bgp_community_filter_resmoke.md");
const deviceId = Number(process.env.BGP_COMMUNITY_RESMOKE_DEVICE_ID ?? "1");

const code = `
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { desc, eq } from "drizzle-orm";
import { db, devicesTable, discoverySnapshotsTable, complianceJobsTable, complianceFindingsTable, collectedConfigsTable } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/lib/db/src/index.ts")).href)};
import { runDeviceDiscovery } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/device-discovery/discovery.service.ts")).href)};
import { executeComplianceJob } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/compliance/compliance-engine.ts")).href)};
import { runBgpChecks } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/compliance/checks/bgp-checks.ts")).href)};
import { parseRunningConfigCommunities } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/community-parser.ts")).href)};
import { parseHuaweiPolicies } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-parser.ts")).href)};
import { normalizePolicyLookupKey } from ${JSON.stringify(pathToFileURL(path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-utils.ts")).href)};

const deviceId = ${JSON.stringify(deviceId)};
const reportPath = ${JSON.stringify(reportPath)};

async function main() {

function entryLine(filter) {
  return String(filter?.entries?.[0]?.line ?? "");
}

function communityIndex(filter) {
  const idx = filter?.entries?.[0]?.index;
  return typeof idx === "number" ? idx : null;
}

function policyCommunityRefs(snapshot) {
  const refs = [];
  for (const policy of snapshot.policies ?? []) {
    for (const node of policy.nodes ?? []) {
      for (const detail of node.matchDetails ?? []) {
        if (detail?.type === "community-filter" && detail.name) {
          refs.push({ policy: policy.name, node: node.sequence ?? null, communityFilter: detail.name, raw: detail.raw });
        }
      }
    }
  }
  return refs;
}

function dependencyStates(snapshot) {
  const communityNames = new Set((snapshot.communities ?? []).map((item) => normalizePolicyLookupKey(item.name)));
  return policyCommunityRefs(snapshot).map((ref) => ({
    ...ref,
    status: communityNames.has(normalizePolicyLookupKey(ref.communityFilter)) ? "FOUND" : "MISSING",
    evidence: communityNames.has(normalizePolicyLookupKey(ref.communityFilter))
      ? \`community-filter \${ref.communityFilter} encontrado no snapshot.\`
      : \`Route-policy \${ref.policy} node \${ref.node ?? "sem-node"} referencia community-filter \${ref.communityFilter}, mas ele não foi encontrado no snapshot.\`,
  }));
}

function sample(items, limit = 8) {
  return items.slice(0, limit);
}

const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
assert.ok(device, \`device \${deviceId} not found\`);

const snapshot = await runDeviceDiscovery(deviceId, {
  contexts: ["bgp", "policies"],
  preferLiveSsh: true,
  allowSnmpFallback: false,
  useCachedConfig: true,
});
assert.ok(snapshot, "discovery returned null");

const [snapshotRow] = await db.select().from(discoverySnapshotsTable).where(eq(discoverySnapshotsTable.deviceId, deviceId)).orderBy(desc(discoverySnapshotsTable.createdAt)).limit(1);
assert.ok(snapshotRow, "latest snapshot not persisted");
const [configRow] = await db.select().from(collectedConfigsTable).where(eq(collectedConfigsTable.deviceId, deviceId)).orderBy(desc(collectedConfigsTable.collectedAt)).limit(1);

const [job] = await db.insert(complianceJobsTable).values({
  deviceId,
  contexts: JSON.stringify(["bgp"]),
  policyProfileName: "huawei-vrp-edge-balanced",
  status: "pending",
  passCount: 0,
  failCount: 0,
}).returning();
await executeComplianceJob(job.id);

const persistedFindings = await db.select().from(complianceFindingsTable).where(eq(complianceFindingsTable.jobId, job.id));
const inMemoryFindings = await runBgpChecks({
  device,
  contexts: ["bgp"],
  snapshotRow,
  snapshot,
  collectedConfig: null,
  rawConfig: "",
  source: "ssh_running_config",
  confidence: "high",
  profile: null,
}, { allowLiveProof: false });

const rawConfig = configRow?.rawConfig || "";
const parsedCommunities = rawConfig ? parseRunningConfigCommunities(rawConfig) : { communityFilters: [], routePolicyIfMatch: [] };
const parsedPolicies = rawConfig ? parseHuaweiPolicies(rawConfig) : [];
const communities = snapshot.communities ?? [];
const noIndexFixture = parseRunningConfigCommunities("ip community-filter basic FNA-EXPORT-P1 permit 64777:58301").communityFilters[0];
const withIndexFixture = parseRunningConfigCommunities("ip community-filter basic FNA-EXPORT-P1 index 10 permit 64777:58301").communityFilters[0];

const noIndexLive = communities.filter((item) => /^ip community-filter basic \\S+ permit \\S+/i.test(entryLine(item)));
const withIndexLive = communities.filter((item) => /^ip community-filter basic \\S+ index \\d+ permit \\S+/i.test(entryLine(item)) && communityIndex(item) !== null);
const routePolicyNodes = (snapshot.policies ?? []).flatMap((policy) => (policy.nodes ?? []).map((node) => ({ policy: policy.name, node: node.sequence, action: node.action })));
const badPermitNodes = routePolicyNodes.filter((row) => row.node === "permit" || row.node === "deny");
const deps = dependencyStates(snapshot);
const foundDeps = deps.filter((dep) => dep.status === "FOUND");
const missingDeps = deps.filter((dep) => dep.status === "MISSING");
const missingFindings = persistedFindings.filter((finding) => /referencia community-filter .*não foi encontrado no snapshot/.test(finding.message ?? finding.detail ?? ""));
const genericFindings = persistedFindings.filter((finding) => /Não foi possível comprovar community-filters no snapshot/i.test(finding.message ?? finding.detail ?? ""));
const foundRiskFindings = persistedFindings.filter((finding) => foundDeps.some((dep) => (finding.message ?? finding.detail ?? "").includes(dep.communityFilter) && /não foi encontrado|ausente|inexistente|risco/i.test(finding.message ?? finding.detail ?? "")));
const criticalMissing = missingFindings.filter((finding) => finding.severity === "critical");

const missingSyntheticSnapshot = {
  ...snapshot,
  parsed_config: undefined,
  policies: [
    ...(snapshot.policies ?? []),
    {
      name: "RESMOKE-MISSING-CF",
      nodes: [{
        sequence: 2013,
        action: "permit",
        matches: ["if-match community-filter RESMOKE-CF-MISSING"],
        matchDetails: [{ type: "community-filter", name: "RESMOKE-CF-MISSING", raw: "if-match community-filter RESMOKE-CF-MISSING" }],
        applies: [],
        evidence: { source: "ssh_running_config", confidence: "high", evidence: "route-policy RESMOKE-MISSING-CF" },
      }],
      source: "ssh_running_config",
      confidence: "high",
      evidence: "route-policy RESMOKE-MISSING-CF",
    },
  ],
};
const syntheticMissingFindings = await runBgpChecks({
  device,
  contexts: ["bgp"],
  snapshotRow,
  snapshot: missingSyntheticSnapshot,
  collectedConfig: null,
  rawConfig: "",
  source: "ssh_running_config",
  confidence: "high",
  profile: null,
}, { allowLiveProof: false });
const syntheticSpecificMissing = syntheticMissingFindings.filter((finding) => /Route-policy RESMOKE-MISSING-CF node 2013 referencia community-filter RESMOKE-CF-MISSING, mas ele não foi encontrado no snapshot/.test(finding.message));

assert.ok(communities.length > 0, "snapshot has no parsed community-filters");
assert.ok(noIndexFixture && noIndexFixture.index === null && noIndexFixture.action === "permit" && noIndexFixture.value === "64777:58301", "no-index parser regression");
assert.ok(withIndexFixture && withIndexFixture.index === 10, "with-index parser regression");
assert.equal(badPermitNodes.length, 0, "route-policy node parsed as permit/deny");
assert.ok(foundDeps.length > 0, "no FOUND community-filter dependencies in snapshot");
assert.ok(parsedCommunities.communityFilters.length > 0, "cached raw config parser found no community-filters");
assert.equal(genericFindings.length, 0, "generic community-filter proof finding still present");
assert.equal(foundRiskFindings.length, 0, "FOUND dependency generated risk finding");
assert.equal(criticalMissing.length, 0, "MISSING dependency severity critical");
assert.ok(inMemoryFindings.every((finding) => !/Não foi possível comprovar community-filters no snapshot/i.test(finding.message)), "generic finding from in-memory analyzer");
assert.equal(syntheticSpecificMissing.length, 1, "synthetic MISSING dependency did not generate specific finding");
assert.equal(syntheticSpecificMissing[0].severity, "medium", "synthetic MISSING severity is not medium");

const missingSpecific = missingFindings.every((finding) => /Route-policy .* node .* referencia community-filter .* não foi encontrado no snapshot/.test((finding.message ?? finding.detail ?? "").replace(", mas ele", "")));
assert.ok(missingFindings.length === 0 || missingSpecific, "MISSING finding is not specific");

const lines = [
  "# BGP Community-filter Resmoke",
  "",
  \`Device: \${device.id} \${device.hostname}\`,
  \`Snapshot: \${snapshotRow.id} status=\${snapshot.status} sources=\${(snapshot.sourcesUsed ?? []).join(",")}\`,
  \`Compliance job: \${job.id}\`,
  "",
  "## Parser",
  "",
  \`- Snapshot community-filters: \${communities.length}\`,
  \`- Raw-config parsed community-filters: \${parsedCommunities.communityFilters.length}\`,
  \`- Basic permit without index parser fixture: name=\${noIndexFixture.name}, index=\${noIndexFixture.index}, action=\${noIndexFixture.action}, value=\${noIndexFixture.value}\`,
  \`- Basic permit with index parser fixture: name=\${withIndexFixture.name}, index=\${withIndexFixture.index}, action=\${withIndexFixture.action}, value=\${withIndexFixture.value}\`,
  \`- Live/snapshot basic permit without index examples: \${noIndexLive.length}\`,
  \`- Live/snapshot basic permit with index examples: \${withIndexLive.length}\`,
  "",
  "## Route-policy Nodes",
  "",
  \`- Nodes checked: \${routePolicyNodes.length}\`,
  \`- Bad permit/deny node count: \${badPermitNodes.length}\`,
  ...sample(routePolicyNodes).map((row) => \`- \${row.policy} node=\${row.node} action=\${row.action}\`),
  "",
  "## Dependencies",
  "",
  \`- FOUND: \${foundDeps.length}\`,
  \`- MISSING: \${missingDeps.length}\`,
  "",
  "### FOUND Evidence",
  "",
  ...sample(foundDeps, 12).map((dep) => \`- \${dep.policy} node \${dep.node}: \${dep.evidence}\`),
  "",
  "### MISSING Evidence",
  "",
  ...(missingDeps.length ? sample(missingDeps, 12).map((dep) => \`- \${dep.evidence}\`) : ["- Nenhuma dependência MISSING no snapshot atual."]),
  "",
  "### Synthetic MISSING Evidence",
  "",
  ...syntheticSpecificMissing.map((finding) => \`- severity=\${finding.severity}: \${finding.message}\`),
  "",
  "## Findings",
  "",
  \`- Persisted findings: \${persistedFindings.length}\`,
  \`- Generic message count: \${genericFindings.length}\`,
  \`- FOUND dependency risk findings: \${foundRiskFindings.length}\`,
  \`- Specific MISSING findings: \${missingFindings.length}\`,
  \`- Critical MISSING findings: \${criticalMissing.length}\`,
  \`- Synthetic specific MISSING findings: \${syntheticSpecificMissing.length}\`,
  \`- MISSING severities: \${[...new Set(missingFindings.map((finding) => finding.severity))].join(",") || "n/a"}\`,
  "",
  "## Safety",
  "",
  "- No device write commands executed.",
  "- No NetBox writes executed.",
  "- No sync executed.",
  "- No apply plan executed.",
  "",
  "## Result",
  "",
  "GO",
  "",
];

writeFileSync(reportPath, lines.join("\\n"), "utf8");
console.log(JSON.stringify({
  result: "GO",
  deviceId,
  snapshotId: snapshotRow.id,
  complianceJobId: job.id,
  communities: communities.length,
  rawCommunityFilters: parsedCommunities.communityFilters.length,
  noIndexLive: noIndexLive.length,
  withIndexLive: withIndexLive.length,
  routePolicyNodes: routePolicyNodes.length,
  foundDependencies: foundDeps.length,
  missingDependencies: missingDeps.length,
  genericFindings: genericFindings.length,
  foundRiskFindings: foundRiskFindings.length,
  criticalMissing: criticalMissing.length,
  syntheticSpecificMissing: syntheticSpecificMissing.length,
  reportPath,
}, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
`;

const tempFile = path.join(tempDir, "resmoke.ts");
writeFileSync(tempFile, code, "utf8");
const result = spawnSync(tsxBin, [tempFile], {
  cwd: rootDir,
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://netops:netops@127.0.0.1:5435/netops",
  },
  encoding: "utf8",
});
rmSync(tempDir, { recursive: true, force: true });

if (result.status !== 0) {
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  process.exit(result.status ?? 1);
}

process.stdout.write(result.stdout ?? "");
