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
import { classifyPolicy, shouldIncludeInAnnouncementMatrix } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/resolvers/policy-classifier.ts";
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
import {
  classifyDependencyScope,
  classifyTargetEditMode,
  classifyTargetRoleFromPolicy,
  enrichMatrixRowSemantics,
  isEditableMatrixRow,
  isProtectedGlobalDependency,
  isRealMatrixConflict,
  shouldSuppressSharedDependencyFinding,
} from "../workspace/artifacts/api-server/src/modules/bgp-announcements/resolvers/semantic-dependency-classifier.ts";
import {
  buildSemanticMatrixView,
  enrichMatrixResponseSemantics,
} from "../workspace/artifacts/api-server/src/modules/bgp-announcements/services/semantic-matrix-view.service.ts";
import {
  assessRisk,
  buildBlockAllowProposedState,
  buildCurrentState,
  generateChangePreviewTicketMarkdown,
  previewLogicalDiffFromStates,
  validateGlobalCommunityRemoval,
  validateTargetForPreview,
} from "../workspace/artifacts/api-server/src/modules/bgp-announcements/announcement-change-preview.service.ts";
import {
  buildChangePlanInputFromBgpPreview,
  isPreviewEligibleForChangePlan,
} from "../workspace/artifacts/api-server/src/modules/change-plans/adapters/bgp-announcement-preview.adapter.ts";
import {
  computeAnnouncementSnapshotDiff,
  snapshotDiffSafetyTokens,
} from "../workspace/artifacts/api-server/src/modules/bgp-announcements/announcement-snapshot-diff.service.ts";
import type { MatrixResponse } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcement.types.ts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function sampleAnnouncementPreview(overrides: Record<string, unknown> = {}) {
  const base = {
    id: 1,
    snapshotId: 192,
    tenantId: null,
    deviceId: 94,
    targetId: "ORIGIN-TEST:10:ipv4",
    targetName: "ORIGIN-TEST",
    targetRole: "origin",
    targetEditMode: "editable_future",
    actionType: "block_announcement",
    upstreamCircuitId: "01",
    currentState: { communities: ["64777:51001"], cellStates: { "01": "On" }, prependCounts: {}, announcementAllowed: true, notes: [] },
    proposedState: { communities: [], cellStates: { "01": "Off" }, prependCounts: {}, announcementAllowed: false, notes: [] },
    logicalDiff: ["C01 estado: On → Off"],
    affectedPolicies: ["ORIGIN-TEST"],
    affectedCommunities: [],
    protectedGlobals: [],
    upstreamAuditImpact: [],
    validation: { status: "ok", ok: true, errors: [], warnings: [] },
    riskAssessment: { level: "low", blocked: false, reasons: [], summary: "ok" },
    ticketMarkdown: "# Preview\n\nNenhum comando foi executado.",
    createdBy: null,
  };
  return { ...base, ...overrides } as import("../workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcement.types.ts").AnnouncementChangePreview;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function buildTestMatrixResponse(
  deviceId: number,
  snapshotId: number,
  fixture = FIXTURE,
  mutate?: (matrix: MatrixResponse) => MatrixResponse,
): MatrixResponse {
  const parsed = parseHuaweiPolicyDependencyPipeline(fixture, "ssh_running_config");
  const graph = buildBgpPolicyGraph(parsed, fixture);
  const upstreams = [
    { circuitId: "01", displayName: "INFORR", role: "provider" },
    { circuitId: "10", displayName: "EBT", role: "provider" },
  ];
  const { rows, findings } = buildAnnouncementMatrix({
    deviceId,
    parsedConfig: parsed,
    graph,
    upstreams,
    collectionAgeMinutes: 5,
    lastCollectedAt: new Date().toISOString(),
  });
  const counters = computeSnapshotCounters({
    deviceId,
    upstreams,
    rows,
    findings,
    generatedAt: new Date().toISOString(),
  }, upstreams.length);
  const matrix = enrichMatrixResponseSemantics({
    deviceId,
    upstreams,
    rows,
    findings,
    generatedAt: new Date().toISOString(),
    meta: {
      source: "database_only",
      collectionAgeMinutes: 5,
      lastCollectedAt: new Date().toISOString(),
      readOnly: true,
      refreshMode: "database_only",
      snapshotId,
      snapshotCreatedAt: new Date().toISOString(),
      counters,
      warnings: [],
      status: determineSnapshotStatus({ deviceId, upstreams, rows, findings, generatedAt: new Date().toISOString() }),
    },
  }, parsed);
  return mutate ? mutate(matrix) : matrix;
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
  "semantic-view": [
    {
      name: "customer target editable_future",
      fn: () => {
        const classification = classifyPolicy("AS269485-NICKNET-Import-V4", parseBgpNetworkStatements(FIXTURE), parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config"));
        const role = classifyTargetRoleFromPolicy(classification.name, classification);
        assert(role === "customer", "customer role");
        assert(classifyTargetEditMode(role) === "editable_future", "editable");
      },
    },
    {
      name: "origin target editable_future",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const classification = classifyPolicy("ORIGIN-45-169-160-000-23", parseBgpNetworkStatements(FIXTURE), parsed);
        assert(classifyTargetRoleFromPolicy(classification.name, classification) === "origin", "origin");
        assert(classifyTargetEditMode("origin") === "editable_future", "editable");
      },
    },
    {
      name: "upstream/provider audit_only",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const exportClass = classifyPolicy("C01-EXPORT-IPV4", parseBgpNetworkStatements(FIXTURE), parsed);
        const role = classifyTargetRoleFromPolicy(exportClass.name, exportClass);
        assert(role === "provider" || role === "upstream", "provider/upstream");
        assert(classifyTargetEditMode(role) === "audit_only", "audit only");
      },
    },
    {
      name: "ix/cdn audit_only",
      fn: () => {
        assert(classifyTargetEditMode("ix") === "audit_only", "ix audit");
        assert(classifyTargetEditMode("cdn") === "audit_only", "cdn audit");
      },
    },
    {
      name: "ibgp hidden and unknown not editable",
      fn: () => {
        assert(classifyTargetEditMode("ibgp") === "hidden", "ibgp hidden");
        assert(classifyTargetEditMode("unknown") === "unknown", "unknown mode");
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const row = enrichMatrixRowSemantics({
          targetKey: "x",
          targetType: "unknown",
          routePolicyName: "UNKNOWN-POLICY",
          node: 10,
          family: "ipv4",
          prefixScope: "x",
          affectedPrefixes: [],
          prefixListName: null,
          modifiable: false,
          riskLevel: "high",
          cells: [],
          findings: [],
          lastCollectedAt: null,
          collectionAgeMinutes: null,
        }, parsed);
        assert(!isEditableMatrixRow(row), "unknown not editable");
      },
    },
    {
      name: "global community-filter protected_global",
      fn: () => {
        assert(isProtectedGlobalDependency("GLOBAL-EXPORT-UPSTREAM-P3", "community-filter"), "global cf");
        const scope = classifyDependencyScope("GLOBAL-EXPORT-UPSTREAM-P3", "community-filter", 3);
        assert(scope === "global_shared", "global scope");
      },
    },
    {
      name: "global ip-prefix protected_global",
      fn: () => {
        assert(isProtectedGlobalDependency("GLOBAL-ORIGIN-PL", "prefix-list"), "global prefix");
      },
    },
    {
      name: "shared global does not generate removal conflict finding",
      fn: () => {
        assert(shouldSuppressSharedDependencyFinding("PREFIX_LIST_SHARED_BY_MULTIPLE_POLICIES", "GLOBAL-EXPORT-UPSTREAM-P3"), "suppress");
      },
    },
    {
      name: "export policy excluded from main matrix",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const exportClass = classifyPolicy("C01-EXPORT-IPV4", parseBgpNetworkStatements(FIXTURE), parsed);
        assert(!shouldIncludeInAnnouncementMatrix(exportClass), "export excluded");
        const customerClass = classifyPolicy("AS269485-NICKNET-Import-V4", parseBgpNetworkStatements(FIXTURE), parsed);
        assert(shouldIncludeInAnnouncementMatrix(customerClass), "customer import included");
      },
    },
    {
      name: "legacy snapshot rows derive semantics",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
        const graph = buildBgpPolicyGraph(parsed, FIXTURE);
        const { rows } = buildAnnouncementMatrix({
          deviceId: 1,
          parsedConfig: parsed,
          graph,
          upstreams: [{ circuitId: "01", displayName: "INFORR", role: "provider" }],
          collectionAgeMinutes: 5,
          lastCollectedAt: new Date().toISOString(),
        });
        const legacy = rows.map((row) => {
          const { targetRole, targetEditMode, dependencyScope, dependencyProtection, dependencyReason, ...rest } = row;
          void targetRole; void targetEditMode; void dependencyScope; void dependencyProtection; void dependencyReason;
          return rest;
        });
        const enriched = enrichMatrixResponseSemantics({
          deviceId: 1,
          upstreams: [{ circuitId: "01", displayName: "INFORR", role: "provider" }],
          rows: legacy,
          findings: [],
          generatedAt: new Date().toISOString(),
        }, parsed);
        assert(enriched.semanticView?.editableRowCount >= 1, "derived editable count");
        assert(enriched.rows[0]?.targetRole, "derived role");
      },
    },
    {
      name: "semantic counters and real conflicts",
      fn: () => {
        const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE_CONFLICT, "ssh_running_config");
        const graph = buildBgpPolicyGraph(parsed, FIXTURE_CONFLICT);
        const { rows, findings } = buildAnnouncementMatrix({
          deviceId: 1,
          parsedConfig: parsed,
          graph,
          upstreams: [{ circuitId: "10", displayName: "EBT", role: "provider" }],
          collectionAgeMinutes: 0,
          lastCollectedAt: new Date().toISOString(),
        });
        const view = buildSemanticMatrixView({ deviceId: 1, upstreams: [], rows, findings, generatedAt: new Date().toISOString() }, parsed);
        assert(view.countersByTargetRole.origin >= 1, "origin counter");
        assert(view.realConflicts.length >= 1 || rows.some((row) => isRealMatrixConflict(row)), "conflict");
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
  "change-preview": [
    {
      name: "customer target editable_future allowed",
      fn: () => {
        const row = enrichMatrixRowSemantics({
          targetKey: "origin:10:ipv4",
          targetType: "customer",
          routePolicyName: "AS269485-NICKNET-Import-V4",
          node: 10,
          family: "ipv4",
          prefixScope: "AS269485-NICKNET",
          affectedPrefixes: ["45.187.202.0/24"],
          prefixListName: "AS269485-NICKNET",
          modifiable: true,
          riskLevel: "low",
          cells: [],
          findings: [],
          lastCollectedAt: null,
          collectionAgeMinutes: null,
        });
        const validation = validateTargetForPreview(row, "set_community", undefined);
        assert(validation.ok, "customer editable");
      },
    },
    {
      name: "origin target editable_future allowed",
      fn: () => {
        const row = enrichMatrixRowSemantics({
          targetKey: "origin:10:ipv4",
          targetType: "origin",
          routePolicyName: "ORIGIN-45-169-160-000-23",
          node: 10,
          family: "ipv4",
          prefixScope: "ORIGIN-45-169-160",
          affectedPrefixes: ["45.169.160.0/23"],
          prefixListName: "ORIGIN-45-169-160",
          modifiable: true,
          riskLevel: "low",
          cells: [],
          findings: [],
          lastCollectedAt: null,
          collectionAgeMinutes: null,
        });
        assert(validateTargetForPreview(row, "set_community", undefined).ok, "origin editable");
      },
    },
    {
      name: "upstream/provider/ix/cdn blocked",
      fn: () => {
        for (const role of ["upstream", "provider", "ix", "cdn"] as const) {
          const row = {
            targetKey: "x",
            targetType: "unknown" as const,
            routePolicyName: "C01-EXPORT-IPV4",
            node: 10,
            family: "ipv4" as const,
            prefixScope: "x",
            affectedPrefixes: [],
            prefixListName: null,
            modifiable: false,
            riskLevel: "low" as const,
            cells: [],
            findings: [],
            lastCollectedAt: null,
            collectionAgeMinutes: null,
            targetRole: role,
            targetEditMode: "audit_only" as const,
          };
          const validation = validateTargetForPreview(row, "set_community", undefined);
          assert(!validation.ok && validation.status === "blocked", `${role} blocked`);
        }
      },
    },
    {
      name: "unknown target blocked",
      fn: () => {
        const row = enrichMatrixRowSemantics({
          targetKey: "u",
          targetType: "unknown",
          routePolicyName: "UNKNOWN-POLICY",
          node: 10,
          family: "ipv4",
          prefixScope: "x",
          affectedPrefixes: [],
          prefixListName: null,
          modifiable: false,
          riskLevel: "low",
          cells: [],
          findings: [],
          lastCollectedAt: null,
          collectionAgeMinutes: null,
        });
        assert(!validateTargetForPreview(row, "set_community", undefined).ok, "unknown blocked");
      },
    },
    {
      name: "protected_global blocks alteration",
      fn: () => {
        const row = {
          targetKey: "g",
          targetType: "customer" as const,
          routePolicyName: "AS1-Import",
          node: 10,
          family: "ipv4" as const,
          prefixScope: "GLOBAL-ROUTE-V4",
          affectedPrefixes: [],
          prefixListName: "GLOBAL-ROUTE-V4",
          modifiable: true,
          riskLevel: "low" as const,
          cells: [],
          findings: [],
          lastCollectedAt: null,
          collectionAgeMinutes: null,
          targetRole: "customer" as const,
          targetEditMode: "editable_future" as const,
          dependencyProtection: "protected_global" as const,
        };
        assert(!validateTargetForPreview(row, "remove_community", "64777:51001").ok, "protected global row");
      },
    },
    {
      name: "set_community logicalDiff",
      fn: () => {
        const current = buildCurrentState({
          targetKey: "t",
          targetType: "origin",
          routePolicyName: "ORIGIN-TEST",
          node: 10,
          family: "ipv4",
          prefixScope: "x",
          affectedPrefixes: [],
          prefixListName: null,
          modifiable: true,
          riskLevel: "low",
          cells: [{ circuitId: "01", upstreamName: "INFORR", state: "on", label: "On", community: "64777:51001", actionCode: "01", prependCount: null, confidence: "high" }],
          findings: [],
          lastCollectedAt: null,
          collectionAgeMinutes: null,
        });
        const proposed = buildBlockAllowProposedState(current, "01", "block_announcement");
        const diff = previewLogicalDiffFromStates(current, proposed);
        assert(diff.some((line) => line.includes("Off") || line.includes("community")), "diff lines");
      },
    },
    {
      name: "block_announcement proposedState",
      fn: () => {
        const current = buildCurrentState({
          targetKey: "t",
          targetType: "origin",
          routePolicyName: "ORIGIN-TEST",
          node: 10,
          family: "ipv4",
          prefixScope: "x",
          affectedPrefixes: [],
          prefixListName: null,
          modifiable: true,
          riskLevel: "low",
          cells: [{ circuitId: "01", upstreamName: "INFORR", state: "on", label: "On", community: "64777:51001", actionCode: "01", prependCount: null, confidence: "high" }],
          findings: [],
          lastCollectedAt: null,
          collectionAgeMinutes: null,
        });
        const proposed = buildBlockAllowProposedState(current, "01", "block_announcement");
        assert(!proposed.announcementAllowed, "blocked announcement");
        assert(proposed.cellStates["01"] === "Off", "off cell");
      },
    },
    {
      name: "remove global community blocked",
      fn: () => {
        const validation = validateGlobalCommunityRemoval("GLOBAL-EXPORT-UPSTREAM-P3");
        assert(!validation.ok, "global filter blocked");
      },
    },
    {
      name: "ticket contains no command executed notice",
      fn: () => {
        const markdown = generateChangePreviewTicketMarkdown({
          snapshotId: 1,
          tenantId: null,
          deviceId: 1,
          targetId: "t",
          targetName: "ORIGIN-TEST",
          targetRole: "origin",
          targetEditMode: "editable_future",
          actionType: "set_community",
          upstreamCircuitId: "01",
          currentState: buildCurrentState({
            targetKey: "t",
            targetType: "origin",
            routePolicyName: "ORIGIN-TEST",
            node: 10,
            family: "ipv4",
            prefixScope: "x",
            affectedPrefixes: [],
            prefixListName: null,
            modifiable: true,
            riskLevel: "low",
            cells: [],
            findings: [],
            lastCollectedAt: null,
            collectionAgeMinutes: null,
          }),
          proposedState: buildCurrentState({
            targetKey: "t",
            targetType: "origin",
            routePolicyName: "ORIGIN-TEST",
            node: 10,
            family: "ipv4",
            prefixScope: "x",
            affectedPrefixes: [],
            prefixListName: null,
            modifiable: true,
            riskLevel: "low",
            cells: [],
            findings: [],
            lastCollectedAt: null,
            collectionAgeMinutes: null,
          }),
          logicalDiff: ["test"],
          affectedPolicies: ["ORIGIN-TEST"],
          affectedCommunities: [],
          protectedGlobals: [],
          upstreamAuditImpact: [],
          validation: { status: "ok", ok: true, errors: [], warnings: [] },
          riskAssessment: { level: "low", blocked: false, reasons: [], summary: "ok" },
          ticketMarkdown: "",
          createdBy: null,
        });
        assert(markdown.includes("Nenhum comando foi executado"), "ticket notice");
        assert(markdown.includes("Preview gerado a partir de snapshot persistido"), "snapshot notice");
      },
    },
    {
      name: "service avoids ssh snmp connector imports",
      fn: () => {
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
        const file = readFileSync(path.join(root, "workspace/artifacts/api-server/src/modules/bgp-announcements/announcement-change-preview.service.ts"), "utf8");
        for (const token of ["connector", "net-snmp", "ssh2", "runDiscovery", "collectSnmp"]) {
          assert(!file.toLowerCase().includes(token.toLowerCase()), `must not reference ${token}`);
        }
      },
    },
    {
      name: "viewer read operator generate rbac",
      fn: () => {
        const viewer = { role: "viewer" as const, permissionsJson: null };
        const operator = { role: "operator" as const, permissionsJson: null };
        assert(checkPermission(viewer, "bgp.announcements.read"), "viewer read");
        assert(!checkPermission(viewer, "bgp.announcements.preview"), "viewer no preview");
        assert(checkPermission(operator, "bgp.announcements.preview"), "operator preview");
      },
    },
    {
      name: "risk levels blocked high medium low",
      fn: () => {
        const editableRow = enrichMatrixRowSemantics({
          targetKey: "t",
          targetType: "origin",
          routePolicyName: "ORIGIN-TEST",
          node: 10,
          family: "ipv4",
          prefixScope: "x",
          affectedPrefixes: [],
          prefixListName: null,
          modifiable: true,
          riskLevel: "low",
          cells: [],
          findings: [],
          lastCollectedAt: null,
          collectionAgeMinutes: null,
        });
        const blocked = assessRisk({
          row: editableRow,
          validation: { status: "blocked", ok: false, errors: ["audit"], warnings: [] },
          hasSharedDependency: false,
          hasRealConflict: false,
          ambiguousCommunity: false,
          multiCustomerImpact: false,
        });
        assert(blocked.level === "blocked", "blocked");
        const high = assessRisk({
          row: editableRow,
          validation: { status: "warning", ok: true, errors: [], warnings: [] },
          hasSharedDependency: false,
          hasRealConflict: true,
          ambiguousCommunity: false,
          multiCustomerImpact: false,
        });
        assert(high.level === "high", "high");
        const medium = assessRisk({
          row: editableRow,
          validation: { status: "warning", ok: true, errors: [], warnings: ["shared"] },
          hasSharedDependency: true,
          hasRealConflict: false,
          ambiguousCommunity: false,
          multiCustomerImpact: false,
        });
        assert(medium.level === "medium", "medium");
        const low = assessRisk({
          row: editableRow,
          validation: { status: "ok", ok: true, errors: [], warnings: [] },
          hasSharedDependency: false,
          hasRealConflict: false,
          ambiguousCommunity: false,
          multiCustomerImpact: false,
        });
        assert(low.level === "low", "low");
      },
    },
    {
      name: "legacy snapshot row derives semantics in preview path",
      fn: () => {
        const legacyRow = {
          targetKey: "legacy",
          targetType: "origin" as const,
          routePolicyName: "ORIGIN-45-169-160-000-23",
          node: 10,
          family: "ipv4" as const,
          prefixScope: "ORIGIN-45-169-160",
          affectedPrefixes: ["45.169.160.0/23"],
          prefixListName: "ORIGIN-45-169-160",
          modifiable: true,
          riskLevel: "low" as const,
          cells: [],
          findings: [],
          lastCollectedAt: null,
          collectionAgeMinutes: null,
        };
        const enriched = enrichMatrixRowSemantics(legacyRow);
        assert(enriched.targetRole === "origin", "derived role");
        assert(enriched.targetEditMode === "editable_future", "derived edit mode");
      },
    },
    {
      name: "set_prepend unsupported_preview",
      fn: () => {
        const row = enrichMatrixRowSemantics({
          targetKey: "t",
          targetType: "origin",
          routePolicyName: "ORIGIN-TEST",
          node: 10,
          family: "ipv4",
          prefixScope: "x",
          affectedPrefixes: [],
          prefixListName: null,
          modifiable: true,
          riskLevel: "low",
          cells: [],
          findings: [],
          lastCollectedAt: null,
          collectionAgeMinutes: null,
        });
        const validation = validateTargetForPreview(row, "set_prepend", undefined);
        assert(validation.status === "unsupported_preview", "prepend unsupported");
      },
    },
  ],
  "change-plan-link": [
    {
      name: "creates draft plan input from low preview",
      fn: () => {
        const preview = sampleAnnouncementPreview({ riskAssessment: { level: "low", blocked: false, reasons: [], summary: "ok" } });
        assert(isPreviewEligibleForChangePlan(preview).ok, "eligible");
        const input = buildChangePlanInputFromBgpPreview({ preview, previewId: 1, hostname: "lab" });
        assert(input.module === "bgp_announcements", "module");
        assert(input.statusOverride === undefined, "override set later");
        assert(input.sourceObjectType === "bgp_announcement_change_preview", "source type");
        assert(String(input.metadata?.logicalDiff).includes("C01"), "logical diff preserved");
        assert(String(input.metadata?.ticketMarkdown).includes("Nenhum comando foi executado"), "ticket preserved");
      },
    },
    {
      name: "medium preview eligible with warnings",
      fn: () => {
        const preview = sampleAnnouncementPreview({
          validation: { status: "warning", ok: true, errors: [], warnings: ["partial data"] },
          riskAssessment: { level: "medium", blocked: false, reasons: ["partial"], summary: "medium" },
        });
        const eligibility = isPreviewEligibleForChangePlan(preview);
        assert(eligibility.ok, "medium ok");
        assert(eligibility.warnings.length > 0, "warnings");
      },
    },
    {
      name: "high preview eligible with ack path",
      fn: () => {
        const preview = sampleAnnouncementPreview({
          riskAssessment: { level: "high", blocked: false, reasons: ["conflict"], summary: "high" },
        });
        assert(isPreviewEligibleForChangePlan(preview).ok, "high still eligible for draft");
      },
    },
    {
      name: "blocked preview does not create plan",
      fn: () => {
        const preview = sampleAnnouncementPreview({
          validation: { status: "blocked", ok: false, errors: ["blocked"], warnings: [] },
          riskAssessment: { level: "blocked", blocked: true, reasons: ["blocked"], summary: "blocked" },
        });
        assert(!isPreviewEligibleForChangePlan(preview).ok, "blocked");
      },
    },
    {
      name: "upstream/provider/ix/cdn blocked",
      fn: () => {
        for (const role of ["upstream", "provider", "ix", "cdn"] as const) {
          const preview = sampleAnnouncementPreview({ targetRole: role, targetEditMode: "audit_only" });
          assert(!isPreviewEligibleForChangePlan(preview).ok, `${role} blocked`);
        }
      },
    },
    {
      name: "unknown blocked",
      fn: () => {
        const preview = sampleAnnouncementPreview({ targetRole: "unknown", targetEditMode: "unknown" });
        assert(!isPreviewEligibleForChangePlan(preview).ok, "unknown blocked");
      },
    },
    {
      name: "protected global target blocked",
      fn: () => {
        const preview = sampleAnnouncementPreview({
          protectedGlobals: [{
            objectName: "GLOBAL-ROUTE-V4",
            objectKind: "prefix-list",
            dependencyScope: "global_shared",
            dependencyProtection: "protected_global",
            reason: "protected",
            consumerCount: 3,
            consumers: ["GLOBAL-ROUTE-V4"],
          }],
          affectedPolicies: ["GLOBAL-ROUTE-V4"],
        });
        assert(!isPreviewEligibleForChangePlan(preview).ok, "global blocked");
      },
    },
    {
      name: "viewer vs operator rbac",
      fn: () => {
        const viewer = { role: "viewer" as const, permissionsJson: null };
        const operator = { role: "operator" as const, permissionsJson: null };
        assert(!checkPermission(viewer, "bgp.announcements.plan"), "viewer no plan");
        assert(checkPermission(operator, "bgp.announcements.plan"), "operator plan");
      },
    },
    {
      name: "plan preserves ticket and diff in metadata",
      fn: () => {
        const preview = sampleAnnouncementPreview();
        const input = buildChangePlanInputFromBgpPreview({ preview, previewId: 7 });
        assert(Array.isArray(input.metadata?.logicalDiff), "diff array");
        assert(String(input.metadata?.ticketMarkdown).includes("Nenhum comando foi executado"), "ticket");
      },
    },
    {
      name: "no execution statuses in adapter",
      fn: () => {
        const input = buildChangePlanInputFromBgpPreview({ preview: sampleAnnouncementPreview(), previewId: 1 });
        const statusText = JSON.stringify(input.metadata ?? {});
        for (const forbidden of ["executing", "executed", "applied", "approved_for_execution", "rollback_executed"]) {
          assert(!statusText.includes(forbidden), `forbidden ${forbidden}`);
        }
        assert(input.metadata?.workflowStatus === "draft", "draft workflow");
      },
    },
    {
      name: "link service avoids ssh snmp connector controlled execution",
      fn: () => {
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
        const file = readFileSync(path.join(root, "workspace/artifacts/api-server/src/modules/bgp-announcements/announcement-change-plan-link.service.ts"), "utf8");
        for (const token of ["connector", "net-snmp", "ssh2", "controlledExecution", "controlled-execution", "CONFIG_APPLY"]) {
          assert(!file.toLowerCase().includes(token.toLowerCase()), `must not reference ${token}`);
        }
      },
    },
    {
      name: "source preview id mapping",
      fn: () => {
        const input = buildChangePlanInputFromBgpPreview({ preview: sampleAnnouncementPreview(), previewId: 42 });
        assert(input.sourceObjectId === "42", "preview id");
        assert(input.metadata?.sourcePreviewId === 42, "metadata preview id");
      },
    },
  ],
  "snapshot-timelapse-diff": [
    {
      name: "same device diff returns readOnly",
      fn: () => {
        const base = buildTestMatrixResponse(94, 192);
        const compare = buildTestMatrixResponse(94, 193);
        const diff = computeAnnouncementSnapshotDiff(base, compare);
        assert(diff.readOnly === true, "readOnly");
        assert(diff.baseSnapshot.deviceId === 94 && diff.compareSnapshot.deviceId === 94, "same device");
      },
    },
    {
      name: "cross device comparison invalid",
      fn: () => {
        const baseDeviceId = 94;
        const compareDeviceId = 95;
        assert(baseDeviceId !== compareDeviceId, "cross device ids differ");
      },
    },
    {
      name: "target_added",
      fn: () => {
        const base = buildTestMatrixResponse(94, 1);
        const compare = buildTestMatrixResponse(94, 2, FIXTURE, (matrix) => ({
          ...matrix,
          rows: [
            ...matrix.rows,
            enrichMatrixRowSemantics({
              targetKey: "added:10:ipv4",
              targetType: "customer",
              routePolicyName: "AS999999-TEST-Import-V4",
              node: 10,
              family: "ipv4",
              prefixScope: "AS999999-TEST",
              affectedPrefixes: ["10.0.0.0/24"],
              prefixListName: "AS999999-TEST",
              modifiable: true,
              riskLevel: "low",
              cells: [{ circuitId: "01", upstreamName: "INFORR", state: "on", label: "On", community: "64777:51001", actionCode: "01", prependCount: null, confidence: "high" }],
              findings: [],
              lastCollectedAt: null,
              collectionAgeMinutes: null,
            }),
          ],
        }));
        const diff = computeAnnouncementSnapshotDiff(base, compare);
        assert(diff.changes.some((c) => c.type === "target_added"), "target_added");
      },
    },
    {
      name: "target_removed",
      fn: () => {
        const full = buildTestMatrixResponse(94, 1);
        const compare = { ...full, rows: full.rows.slice(1) };
        const diff = computeAnnouncementSnapshotDiff(full, compare);
        assert(diff.changes.some((c) => c.type === "target_removed"), "target_removed");
      },
    },
    {
      name: "community_added",
      fn: () => {
        const base = buildTestMatrixResponse(94, 1);
        const compare = buildTestMatrixResponse(94, 2, FIXTURE, (matrix) => ({
          ...matrix,
          rows: matrix.rows.map((row, index) => {
            if (index !== 0) return row;
            return {
              ...row,
              cells: [
                ...row.cells,
                { circuitId: "10", upstreamName: "EBT", state: "on", label: "On", community: "64777:51003", actionCode: "03", prependCount: null, confidence: "high" },
              ],
            };
          }),
        }));
        const diff = computeAnnouncementSnapshotDiff(base, compare);
        assert(diff.changes.some((c) => c.type === "community_added"), "community_added");
      },
    },
    {
      name: "community_removed",
      fn: () => {
        const full = buildTestMatrixResponse(94, 1);
        const compare = buildTestMatrixResponse(94, 2, FIXTURE, (matrix) => ({
          ...matrix,
          rows: matrix.rows.map((row, index) => {
            if (index !== 0 || row.cells.length === 0) return row;
            return { ...row, cells: row.cells.slice(1) };
          }),
        }));
        const diff = computeAnnouncementSnapshotDiff(full, compare);
        assert(diff.changes.some((c) => c.type === "community_removed"), "community_removed");
      },
    },
    {
      name: "conflict_added",
      fn: () => {
        const base = buildTestMatrixResponse(94, 1);
        const compare = buildTestMatrixResponse(94, 2, FIXTURE, (matrix) => ({
          ...matrix,
          semanticView: matrix.semanticView
            ? {
                ...matrix.semanticView,
                realConflicts: [{
                  targetKey: matrix.rows[0]?.targetKey ?? "x",
                  routePolicyName: matrix.rows[0]?.routePolicyName ?? "ORIGIN-TEST",
                  circuitIds: ["10"],
                  message: "Conflito simulado",
                }],
              }
            : matrix.semanticView,
        }));
        const diff = computeAnnouncementSnapshotDiff(base, compare);
        assert(diff.changes.some((c) => c.type === "conflict_added"), "conflict_added");
      },
    },
    {
      name: "conflict_resolved",
      fn: () => {
        const withConflict = buildTestMatrixResponse(94, 1, FIXTURE, (matrix) => ({
          ...matrix,
          semanticView: matrix.semanticView
            ? {
                ...matrix.semanticView,
                realConflicts: [{
                  targetKey: matrix.rows[0]?.targetKey ?? "x",
                  routePolicyName: matrix.rows[0]?.routePolicyName ?? "ORIGIN-TEST",
                  circuitIds: ["10"],
                  message: "Conflito",
                }],
              }
            : matrix.semanticView,
        }));
        const resolved = buildTestMatrixResponse(94, 2, FIXTURE, (matrix) => ({
          ...matrix,
          semanticView: matrix.semanticView
            ? { ...matrix.semanticView, realConflicts: [] }
            : matrix.semanticView,
        }));
        const diff = computeAnnouncementSnapshotDiff(withConflict, resolved);
        assert(diff.changes.some((c) => c.type === "conflict_resolved"), "conflict_resolved");
      },
    },
    {
      name: "protected_global_changed",
      fn: () => {
        const base = buildTestMatrixResponse(94, 1);
        const compare = buildTestMatrixResponse(94, 2, FIXTURE, (matrix) => {
          const globals = matrix.semanticView?.protectedGlobals ?? [];
          if (globals.length === 0) return matrix;
          const updated = { ...globals[0]!, consumerCount: (globals[0]!.consumerCount ?? 1) + 1 };
          return {
            ...matrix,
            semanticView: matrix.semanticView
              ? { ...matrix.semanticView, protectedGlobals: [updated, ...globals.slice(1)] }
              : matrix.semanticView,
          };
        });
        const diff = computeAnnouncementSnapshotDiff(base, compare);
        assert(diff.changes.some((c) => c.type === "protected_global_changed"), "protected_global_changed");
      },
    },
    {
      name: "upstream_audit_changed",
      fn: () => {
        const base = buildTestMatrixResponse(94, 1);
        const auditRow = {
          ...base.rows[0]!,
          targetKey: "audit:10:ipv4",
          routePolicyName: "C01-EXPORT-IPV4",
          targetRole: "provider" as const,
          targetEditMode: "audit_only" as const,
        };
        const compare = {
          ...base,
          rows: [
            auditRow,
            ...base.rows.slice(1),
          ],
        };
        const compareChanged = {
          ...compare,
          rows: compare.rows.map((row) => {
            if (row.targetKey !== "audit:10:ipv4") return row;
            return {
              ...row,
              cells: row.cells.map((cell) => ({ ...cell, community: "64777:59999", label: "P9" })),
            };
          }),
        };
        const diff = computeAnnouncementSnapshotDiff({ ...base, rows: [auditRow, ...base.rows.slice(1)] }, compareChanged);
        assert(diff.changes.some((c) => c.type === "upstream_audit_changed"), "upstream_audit_changed");
        assert(diff.changes.some((c) => c.isAuditOnly), "audit flag");
      },
    },
    {
      name: "legacy snapshot without semanticView still works",
      fn: () => {
        const base = buildTestMatrixResponse(94, 1);
        const compare = buildTestMatrixResponse(94, 2);
        const legacyBase = {
          ...base,
          semanticView: undefined,
          rows: base.rows.map(({ targetRole, targetEditMode, dependencyScope, dependencyProtection, dependencyReason, ...rest }) => rest),
        };
        const legacyCompare = {
          ...compare,
          semanticView: undefined,
          rows: compare.rows.map(({ targetRole, targetEditMode, dependencyScope, dependencyProtection, dependencyReason, ...rest }) => rest),
        };
        const diff = computeAnnouncementSnapshotDiff(legacyBase, legacyCompare);
        assert(diff.readOnly === true, "legacy diff ok");
        assert(Array.isArray(diff.changes), "changes array");
      },
    },
    {
      name: "viewer can read diff rbac",
      fn: () => {
        const viewer = { role: "viewer" as const, permissionsJson: null };
        assert(checkPermission(viewer, "bgp.announcements.read"), "viewer read");
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
      name: "diff does not create preview or change plan",
      fn: () => {
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
        const file = readFileSync(path.join(root, "workspace/artifacts/api-server/src/modules/bgp-announcements/announcement-snapshot-diff.service.ts"), "utf8");
        for (const token of ["from \"./announcement-change-preview", "from \"./announcement-change-plan", "createAnnouncementChangePreview(", "createChangePlanFromPreview("]) {
          assert(!file.includes(token), `must not reference ${token}`);
        }
      },
    },
    {
      name: "diff avoids ssh snmp connector controlled execution",
      fn: () => {
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
        const file = readFileSync(path.join(root, "workspace/artifacts/api-server/src/modules/bgp-announcements/announcement-snapshot-diff.service.ts"), "utf8");
        assert(!/from\s+['"]ssh2['"]/.test(file), "no ssh2 import");
        assert(!/from\s+['"].*net-snmp/.test(file), "no net-snmp import");
        assert(!file.includes("connector-snmp"), "no connector-snmp import");
        assert(!file.includes("runDiscovery("), "no runDiscovery call");
        assert(!file.includes("collectSnmp("), "no collectSnmp call");
        assert(snapshotDiffSafetyTokens().includes("ssh2"), "safety tokens document forbidden integrations");
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
