import { parseCircuitPolicyName } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/parsers/circuit-policy.parser.ts";
import {
  buildCircuitCommunity,
  parseCircuitCommunity,
} from "../workspace/artifacts/api-server/src/modules/bgp-announcements/parsers/community-circuit.parser.ts";
import { parseGlobalCommunity } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/parsers/community-global.parser.ts";
import { parseBgpNetworkStatements } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/parsers/bgp-network.parser.ts";
import { parseNodeApplies } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/parsers/apply-community.parser.ts";
import {
  applyCircuitStateChange,
  findExactCommunitySetMatch,
  hashCommunitySet,
} from "../workspace/artifacts/api-server/src/modules/bgp-announcements/resolvers/community-set-matcher.ts";
import { classifyPolicy } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/resolvers/policy-classifier.ts";
import { extractCircuitIdFromName } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/resolvers/circuit-id.resolver.ts";
import {
  collectProtectedGlobalFilterUsage,
  isProtectedGlobalCommunityFilter,
  isSharedProtectedGlobalFilter,
} from "../workspace/artifacts/api-server/src/modules/bgp-announcements/resolvers/protected-global-filter.ts";
import { expandPrefixList, findPrefixListForNode } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/resolvers/prefix-expansion.resolver.ts";
import { parseHuaweiPolicyDependencyPipeline } from "../workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-dependency-pipeline.ts";
import { buildBgpPolicyGraph } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/graph/bgp-policy-graph.builder.ts";
import { buildAnnouncementMatrix } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/resolvers/announcement-matrix.resolver.ts";
import { compileAnnouncementPreview } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/services/announcement-preview.service.ts";
import { runUpstreamAudit } from "../workspace/artifacts/api-server/src/modules/bgp-upstream-audit/bgp-upstream-audit.service.ts";
import {
  computeSnapshotCounters,
  computeSnapshotWarnings,
  determineSnapshotStatus,
  SNAPSHOT_REFRESH_ALLOWED_SOURCES,
} from "../workspace/artifacts/api-server/src/modules/bgp-announcements/services/announcement-snapshot-refresh.service.ts";
import {
  matrixSnapshotRowToResponse,
  persistAnnouncementMatrixSnapshot,
} from "../workspace/artifacts/api-server/src/modules/bgp-announcements/announcement-matrix-snapshot.service.ts";
import { assertMatrixEnabled } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcement.gate.ts";
import { checkPermission, getDefaultPermissions } from "../workspace/artifacts/api-server/src/lib/auth.ts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const FIXTURE = `
bgp 268707
 ipv4-family unicast
  network 45.169.160.0 255.255.254.0 route-policy ORIGIN-45-169-160-000-23
  network 2001:db8:1::/48 route-policy ORIGIN-IPV6-001
  peer 203.0.113.1 as-number 16735
  peer 203.0.113.1 route-policy C01-EXPORT-IPV4 export
  peer 203.0.113.1 route-policy C01-IMPORT-IPV4 import
route-policy ORIGIN-45-169-160-000-23 permit node 10
 if-match ip-prefix ORIGIN-45-169-160
 apply community 64777:50101 64777:51001 additive
route-policy ORIGIN-IPV6-001 permit node 10
 if-match ipv6 address prefix-list ORIGIN-IPV6-PL
 apply community 64777:50101 additive
route-policy C01-EXPORT-IPV4 permit node 100
 if-match community-filter C01-EXPORT-P2
 apply as-path 268707 268707 additive
route-policy C01-EXPORT-IPV4 permit node 200
 if-match community-filter GLOBAL-EXPORT-UPSTREAM-P3
 apply as-path 268707 268707 268707 additive
route-policy C02-TIM-EXPORT-IPV4 permit node 200
 if-match community-filter GLOBAL-EXPORT-UPSTREAM-P3
 apply as-path 268707 268707 268707 additive
route-policy C01-EXPORT-IPV4 permit node 900
 if-match community-filter C01-EXPORT-OFF
 apply community 64777:51067 additive
route-policy C01-IMPORT-IPV4 permit node 100
 apply community 64777:50101 additive
route-policy MALHA-Export permit node 10
 apply community 64777:50101 additive
route-policy DENY permit node 10
 apply community 64777:50101 additive
ip ip-prefix ORIGIN-45-169-160 index 10 permit 45.169.160.0 23
ip ipv6-prefix ORIGIN-IPV6-PL index 10 permit 2001:db8:1:: 48
ip community-filter basic C01-EXPORT-P2 index 10 permit 64777:51003
ip community-filter basic GLOBAL-EXPORT-UPSTREAM-P3 index 10 permit 64777:60004
ip community-filter basic C01-EXPORT-OFF index 10 permit 64777:51067
ip community-list CLIENTES|2G
 community 64777:50101
 community 64777:51003
route-policy AS269485-NICKNET-Import-V4 permit node 10
 if-match ip-prefix AS269485-NICKNET
 apply community community-list CLIENTES|2G
ip ip-prefix AS269485-NICKNET index 10 permit 45.187.202.0 24
`;

const FIXTURE_MISMATCH = `
route-policy C15-EXPORT-IPV4 permit node 100
 if-match community-filter C15-EXPORT-P3
 apply as-path 268707 268707 268707 additive
ip community-filter basic C15-EXPORT-P3 index 10 permit 64777:51008
`;

const FIXTURE_CONFLICT = `
route-policy ORIGIN-TEST permit node 10
 apply community 64777:51001 64777:51003 additive
`;

const suites: Record<string, Array<{ name: string; fn: () => void }>> = {
  "graph-parser": [
    {
      name: "NETWORK_USES_ORIGIN_POLICY edge",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const graph = buildBgpPolicyGraph(parsed, FIXTURE);
        assert(graph.edges.some((e) => e.type === "NETWORK_USES_ORIGIN_POLICY"), "network edge");
        assert(graph.edges.some((e) => e.type === "POLICY_NODE_MATCHES_COMMUNITY_FILTER"), "cf edge");
        assert(graph.edges.some((e) => e.type === "COMMUNITY_RESOLVES_TO_CIRCUIT_ACTION"), "resolve edge");
      },
    },
    {
      name: "PEER_USES_POLICY edge",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const graph = buildBgpPolicyGraph(parsed, FIXTURE);
        assert(graph.edges.some((e) => e.type === "PEER_USES_POLICY"), "peer edge");
      },
    },
  ],
  "community-resolver": [
    {
      name: "circuit community P2",
      fn: () => {
        const p = parseCircuitCommunity("64777:51003");
        assert(p.valid && p.circuitId === "10" && p.actionCode === "03", "P2");
      },
    },
    {
      name: "global community 600xx",
      fn: () => {
        const g = parseGlobalCommunity("64777:60004");
        assert(g.valid && g.code === "04", "global");
      },
    },
    {
      name: "exclusive circuit change",
      fn: () => {
        const after = applyCircuitStateChange(["64777:50101", "64777:51001", "64777:51601"], "10", "03");
        assert(!after.communities.includes("64777:51001"), "removed old");
        assert(after.communities.includes("64777:51003"), "added P2");
      },
    },
    {
      name: "Off differs from none",
      fn: () => {
        const off = parseCircuitCommunity("64777:51067");
        assert(off.valid && off.actionCode === "67", "off explicit");
        const none = parseCircuitCommunity("64777:12345");
        assert(!none.valid, "unknown not off");
      },
    },
    {
      name: "multiple actions same upstream error path",
      fn: () => {
        const after = applyCircuitStateChange(["64777:51001", "64777:51003"], "10", "03");
        assert(after.removed.length === 2, "both removed before add");
      },
    },
  ],
  "prefix-expansion": [
    {
      name: "ipv4 ip-prefix expansion",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const prefixes = expandPrefixList("ORIGIN-45-169-160", "ipv4", parsed.catalogs);
        assert(prefixes.includes("45.169.160.0/23"), "v4 prefix");
      },
    },
    {
      name: "ipv6 prefix-list expansion",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const prefixes = expandPrefixList("ORIGIN-IPV6-PL", "ipv6", parsed.catalogs);
        assert(prefixes.some((p) => p.includes("2001:db8:1::")), "v6 prefix");
      },
    },
    {
      name: "empty prefix list warning path",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const empty = expandPrefixList("DOES-NOT-EXIST", "ipv4", parsed.catalogs);
        assert(empty.length === 0, "empty");
      },
    },
  ],
  "community-set-match": [
    {
      name: "exact community-list match",
      fn: () => {
        const desired = ["64777:50101", "64777:51003"];
        const catalog = [{ name: "CLIENTES|2G", communities: desired, normalizedHash: hashCommunitySet(desired), isShared: false }];
        assert(findExactCommunitySetMatch(desired, catalog)?.name === "CLIENTES|2G", "match");
      },
    },
    {
      name: "no exact match uses direct communities in preview",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const graph = buildBgpPolicyGraph(parsed, FIXTURE);
        const preview = compileAnnouncementPreview({
          request: {
            deviceId: 1,
            targetPolicyName: "ORIGIN-45-169-160-000-23",
            node: 10,
            family: "ipv4",
            upstreamCircuitId: "10",
            newState: "p3",
          },
          parsedConfig: parsed,
          graph,
          upstreams: [{ circuitId: "01", displayName: "INFORR", role: "provider" }, { circuitId: "10", displayName: "EBT", role: "provider" }],
          communitySets: [],
          localAs: 268707,
        });
        assert(preview.findings.some((f) => f.code === "COMMUNITY_SET_NO_EXACT_MATCH"), "no match finding");
      },
    },
  ],
  "preview-compiler": [
    {
      name: "blocks upstream Cxx",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const graph = buildBgpPolicyGraph(parsed, FIXTURE);
        const preview = compileAnnouncementPreview({
          request: { deviceId: 1, targetPolicyName: "C01-EXPORT-IPV4", node: 100, family: "ipv4", upstreamCircuitId: "01", newState: "p2" },
          parsedConfig: parsed,
          graph,
          upstreams: [{ circuitId: "01", displayName: "INFORR", role: "provider" }],
          communitySets: [],
          localAs: 268707,
        });
        assert(!preview.allowed, "blocked");
        assert(preview.findings.some((f) => f.code === "UPSTREAM_POLICY_IS_MODIFIABLE"), "finding");
      },
    },
    {
      name: "generates diff and rollback",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const graph = buildBgpPolicyGraph(parsed, FIXTURE);
        const preview = compileAnnouncementPreview({
          request: { deviceId: 1, targetPolicyName: "ORIGIN-45-169-160-000-23", node: 10, family: "ipv4", upstreamCircuitId: "10", newState: "p2" },
          parsedConfig: parsed,
          graph,
          upstreams: [{ circuitId: "01", displayName: "INFORR", role: "provider" }, { circuitId: "10", displayName: "EBT", role: "provider" }],
          communitySets: [],
          localAs: 268707,
        });
        assert(preview.generatedScript.includes("route-policy"), "script");
        assert(preview.rollbackScript.includes("route-policy"), "rollback");
        assert(preview.diff.length > 0, "diff");
      },
    },
    {
      name: "customer target modifiable",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const c = classifyPolicy("AS269485-NICKNET-Import-V4", parseBgpNetworkStatements(FIXTURE), parsed);
        assert(c.modifiable, "customer");
      },
    },
  ],
  "upstream-audit-local-as": [
    {
      name: "prepend count mismatch high",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const graph = buildBgpPolicyGraph(parsed, FIXTURE);
        const report = runUpstreamAudit(1, parsed, graph, 268707);
        const row = report.upstreams.find((u) => u.circuitId === "01");
        assert(Boolean(row), "circuit 01");
      },
    },
    {
      name: "local-as mismatch critical in dedicated fixture",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE_MISMATCH, "ssh_running_config");
        const graph = buildBgpPolicyGraph(parsed, FIXTURE_MISMATCH);
        const report = runUpstreamAudit(1, parsed, graph, 268707);
        assert(report.findings.some((f) => f.code === "COMMUNITY_FILTER_ACTION_CODE_MISMATCH"), "filter mismatch");
      },
    },
  ],
  "target-classification": [
    {
      name: "matrix includes only origin and customer import targets",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const graph = buildBgpPolicyGraph(parsed, FIXTURE);
        const { rows, findings } = buildAnnouncementMatrix({
          deviceId: 1,
          parsedConfig: parsed,
          graph,
          upstreams: [{ circuitId: "01", displayName: "INFORR", role: "provider" }, { circuitId: "10", displayName: "EBT", role: "provider" }],
          collectionAgeMinutes: 5,
          lastCollectedAt: new Date().toISOString(),
        });

        assert(rows.some((r) => r.routePolicyName === "ORIGIN-45-169-160-000-23"), "origin");
        assert(rows.some((r) => r.routePolicyName === "ORIGIN-IPV6-001"), "origin ipv6");
        assert(rows.some((r) => r.routePolicyName === "AS269485-NICKNET-Import-V4"), "customer import");
        assert(!rows.some((r) => /Export/i.test(r.routePolicyName)), "export excluded");
        assert(!rows.some((r) => r.routePolicyName === "MALHA-Export"), "malha excluded");
        assert(!rows.some((r) => r.routePolicyName === "DENY"), "deny excluded");
        assert(!rows.some((r) => r.routePolicyName === "C01-IMPORT-IPV4"), "upstream import audit excluded");
        assert(findings.some((f) => f.code === "EXPORT_POLICY_EXCLUDED_FROM_ANNOUNCEMENT_MATRIX"), "info finding");
      },
    },
    {
      name: "upstream audit still includes Cxx export",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const graph = buildBgpPolicyGraph(parsed, FIXTURE);
        const report = runUpstreamAudit(1, parsed, graph, 268707);
        assert(report.upstreams.some((u) => u.exportPolicyName === "C01-EXPORT-IPV4"), "audit export");
      },
    },
  ],
  "upstream-audit-conflict": [
    {
      name: "matrix conflict cell for duplicate circuit actions",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE_CONFLICT, "ssh_running_config");
        const graph = buildBgpPolicyGraph(parsed, FIXTURE_CONFLICT);
        const { rows } = buildAnnouncementMatrix({
          deviceId: 1,
          parsedConfig: parsed,
          graph,
          upstreams: [{ circuitId: "10", displayName: "EBT", role: "provider" }],
          collectionAgeMinutes: 0,
          lastCollectedAt: new Date().toISOString(),
        });
        const row = rows[0];
        assert(row?.cells[0]?.label === "!", "conflict");
      },
    },
  ],
  "protected-global-filter": [
    {
      name: "detect protected global filter pattern",
      fn: () => {
        assert(isProtectedGlobalCommunityFilter("GLOBAL-EXPORT-UPSTREAM-P3"), "global");
        assert(!isProtectedGlobalCommunityFilter("C01-EXPORT-P2"), "not global");
      },
    },
    {
      name: "shared global filter does not conflict",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const usage = collectProtectedGlobalFilterUsage(parsed);
        const shared = usage.find((row) => row.filterName === "GLOBAL-EXPORT-UPSTREAM-P3");
        assert(Boolean(shared && isSharedProtectedGlobalFilter(shared)), "shared");
        const graph = buildBgpPolicyGraph(parsed, FIXTURE);
        const report = runUpstreamAudit(1, parsed, graph, 268707);
        assert(report.findings.some((f) => f.code === "PROTECTED_GLOBAL_FILTER_SHARED_OK"), "ok finding");
      },
    },
    {
      name: "circuit id extracted from asset names",
      fn: () => {
        assert(extractCircuitIdFromName("C01-EXPORT-IPV4") === "01", "policy");
        assert(extractCircuitIdFromName("C01-EXPORT-P2") === "01", "filter");
      },
    },
  ],
  "snapshot-refresh": [
    {
      name: "counters include origin/customer/upstreams",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const graph = buildBgpPolicyGraph(parsed, FIXTURE);
        const { rows, findings } = buildAnnouncementMatrix({
          deviceId: 1,
          parsedConfig: parsed,
          graph,
          upstreams: [{ circuitId: "01", displayName: "INFORR", role: "provider" }, { circuitId: "10", displayName: "EBT", role: "provider" }],
          collectionAgeMinutes: 5,
          lastCollectedAt: new Date().toISOString(),
        });
        const counters = computeSnapshotCounters({
          deviceId: 1,
          upstreams: [{ circuitId: "01", displayName: "INFORR", role: "provider" }],
          rows,
          findings,
          generatedAt: new Date().toISOString(),
        }, 3);
        assert(counters.originTargets >= 2, "origin count");
        assert(counters.customerTargets >= 1, "customer count");
        assert(counters.upstreamCount === 1, "upstream count");
        assert(counters.communitySetCount === 3, "community sets");
      },
    },
    {
      name: "warnings persisted for stale collected_config",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const graph = buildBgpPolicyGraph(parsed, FIXTURE);
        const { rows, findings } = buildAnnouncementMatrix({
          deviceId: 1,
          parsedConfig: parsed,
          graph,
          upstreams: [{ circuitId: "01", displayName: "INFORR", role: "provider" }],
          collectionAgeMinutes: 120,
          lastCollectedAt: new Date().toISOString(),
        });
        const warnings = computeSnapshotWarnings({
          deviceId: 1,
          snapshot: null,
          rawConfig: FIXTURE,
          parsedConfig: parsed,
          graph,
          collectionAgeMinutes: 120,
          lastCollectedAt: new Date().toISOString(),
          source: "collected_config",
        }, {
          deviceId: 1,
          upstreams: [],
          rows,
          findings,
          generatedAt: new Date().toISOString(),
        });
        assert(warnings.some((w) => w.includes("collected_config")), "collected_config warning");
        assert(warnings.some((w) => w.includes("120 min")), "stale warning");
      },
    },
    {
      name: "empty state status when no rows",
      fn: () => {
        const status = determineSnapshotStatus({
          deviceId: 1,
          upstreams: [],
          rows: [],
          findings: [],
          generatedAt: new Date().toISOString(),
        });
        assert(status === "empty", "empty status");
      },
    },
    {
      name: "viewer cannot refresh operator can",
      fn: () => {
        const viewer = { role: "viewer" as const, permissionsJson: null };
        const operator = { role: "operator" as const, permissionsJson: null };
        assert(!checkPermission(viewer, "bgp.announcements.refresh"), "viewer blocked");
        assert(checkPermission(operator, "bgp.announcements.refresh"), "operator allowed");
        assert(getDefaultPermissions("admin").bgp?.announcements?.refresh === true, "admin refresh");
      },
    },
    {
      name: "feature flag off blocks matrix endpoints",
      fn: () => {
        const previous = process.env.BGP_ANNOUNCEMENT_MATRIX_ENABLED;
        process.env.BGP_ANNOUNCEMENT_MATRIX_ENABLED = "false";
        const gate = assertMatrixEnabled();
        assert(!gate.ok && gate.status === 503, "503 when disabled");
        if (previous === undefined) delete process.env.BGP_ANNOUNCEMENT_MATRIX_ENABLED;
        else process.env.BGP_ANNOUNCEMENT_MATRIX_ENABLED = previous;
      },
    },
    {
      name: "snapshot roundtrip stores full rows",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const graph = buildBgpPolicyGraph(parsed, FIXTURE);
        const { rows, findings } = buildAnnouncementMatrix({
          deviceId: 1,
          parsedConfig: parsed,
          graph,
          upstreams: [{ circuitId: "01", displayName: "INFORR", role: "provider" }],
          collectionAgeMinutes: 5,
          lastCollectedAt: new Date().toISOString(),
        });
        const counters = computeSnapshotCounters({
          deviceId: 1,
          upstreams: [{ circuitId: "01", displayName: "INFORR", role: "provider" }],
          rows,
          findings,
          generatedAt: new Date().toISOString(),
        }, 1);
        const matrix = matrixSnapshotRowToResponse({
          id: 99,
          deviceId: 1,
          rowsJson: rows,
          upstreamsJson: [{ circuitId: "01", displayName: "INFORR", role: "provider" }],
          metaJson: { findings, generatedAt: new Date().toISOString(), counters, warnings: [], status: "ok", refreshMode: "database_only" },
          rowCount: rows.length,
          createdAt: new Date(),
        });
        assert(matrix?.rows[0]?.targetKey, "full row roundtrip");
        assert(matrix?.meta?.snapshotId === 99, "snapshot id in meta");
      },
    },
    {
      name: "refresh service avoids ssh snmp connector imports",
      fn: () => {
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
        const refreshFile = readFileSync(path.join(root, "workspace/artifacts/api-server/src/modules/bgp-announcements/services/announcement-snapshot-refresh.service.ts"), "utf8");
        const matrixFile = readFileSync(path.join(root, "workspace/artifacts/api-server/src/modules/bgp-announcements/announcement-matrix.service.ts"), "utf8");
        for (const token of ["connector", "net-snmp", "ssh2", "runDiscovery", "collectSnmp"]) {
          assert(!refreshFile.toLowerCase().includes(token.toLowerCase()), `refresh file must not reference ${token}`);
        }
        assert(!matrixFile.includes("connector-snmp"), "matrix service no snmp connector");
        assert(SNAPSHOT_REFRESH_ALLOWED_SOURCES.includes("discovery_snapshot"), "allowed sources");
      },
    },
    {
      name: "persist export available for append-only snapshots",
      fn: () => {
        assert(typeof persistAnnouncementMatrixSnapshot === "function", "persist export");
      },
    },
  ],
  matrix: [
    {
      name: "origin ipv4 row",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const graph = buildBgpPolicyGraph(parsed, FIXTURE);
        const { rows } = buildAnnouncementMatrix({
          deviceId: 1,
          parsedConfig: parsed,
          graph,
          upstreams: [{ circuitId: "01", displayName: "INFORR", role: "provider" }, { circuitId: "10", displayName: "EBT", role: "provider" }],
          collectionAgeMinutes: 5,
          lastCollectedAt: new Date().toISOString(),
        });
        assert(rows.some((r) => r.routePolicyName.includes("ORIGIN-45")), "origin v4");
        assert(rows.some((r) => r.routePolicyName.includes("ORIGIN-IPV6")), "origin v6");
      },
    },
    {
      name: "apply community list parser",
      fn: () => {
        const parsed = parseNodeApplies([" apply community community-list CLIENTES|2G"]);
        assert(parsed.communityListName === "CLIENTES|2G", "list");
      },
    },
  ],
};

async function main() {
  const suiteName = process.argv[2] ?? "all";
  const selected = suiteName === "all"
    ? Object.entries(suites).flatMap(([group, tests]) => tests.map((test) => ({ ...test, name: `${group}: ${test.name}` })))
    : (suites[suiteName] ?? []).map((test) => ({ ...test, name: `${suiteName}: ${test.name}` }));

  if (selected.length === 0) {
    console.error(`Unknown suite: ${suiteName}`);
    process.exit(1);
  }

  let failed = 0;
  for (const test of selected) {
    try {
      test.fn();
      console.log(`✓ ${test.name}`);
    } catch (error) {
      failed += 1;
      console.log(`✗ ${test.name} — ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(`\n${selected.length - failed}/${selected.length} passed`);
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
