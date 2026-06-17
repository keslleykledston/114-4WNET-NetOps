import { parseCircuitPolicyName } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/parsers/circuit-policy.parser.ts";
import {
  buildCircuitCommunity,
  parseCircuitCommunity,
} from "../workspace/artifacts/api-server/src/modules/bgp-announcements/parsers/community-circuit.parser.ts";
import { parseBgpNetworkStatements } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/parsers/bgp-network.parser.ts";
import { parseNodeApplies } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/parsers/apply-community.parser.ts";
import {
  applyCircuitStateChange,
  findExactCommunitySetMatch,
  hashCommunitySet,
} from "../workspace/artifacts/api-server/src/modules/bgp-announcements/resolvers/community-set-matcher.ts";
import { classifyPolicy } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/resolvers/policy-classifier.ts";
import { parseHuaweiPolicyDependencyPipeline } from "../workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-dependency-pipeline.ts";
import { buildBgpPolicyGraph } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/graph/bgp-policy-graph.builder.ts";
import { buildAnnouncementMatrix } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/resolvers/announcement-matrix.resolver.ts";
import { compileAnnouncementPreview } from "../workspace/artifacts/api-server/src/modules/bgp-announcements/services/announcement-preview.service.ts";
import { runUpstreamAudit } from "../workspace/artifacts/api-server/src/modules/bgp-upstream-audit/bgp-upstream-audit.service.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const FIXTURE = `
bgp 268707
 ipv4-family unicast
  network 45.169.160.0 255.255.254.0 route-policy ORIGIN-45-169-160-000-23
  peer 203.0.113.1 as-number 16735
  peer 203.0.113.1 route-policy C01-EXPORT-IPV4 export
  peer 203.0.113.1 route-policy C01-IMPORT-IPV4 import
route-policy ORIGIN-45-169-160-000-23 permit node 10
 if-match ip-prefix ORIGIN-45-169-160
 apply community 64777:50101 64777:51001 additive
route-policy C01-EXPORT-IPV4 permit node 100
 if-match community-filter C01-EXPORT-P2
 apply as-path 268707 268707 additive
ip ip-prefix ORIGIN-45-169-160 index 10 permit 45.169.160.0 23
ip community-filter basic C01-EXPORT-P2 index 10 permit 64777:51003
ip community-list CLIENTES|2G
 community 64777:50101
 community 64777:51003
route-policy AS269485-NICKNET-Import-V4 permit node 10
 if-match ip-prefix AS269485-NICKNET
 apply community community-list CLIENTES|2G
ip ip-prefix AS269485-NICKNET index 10 permit 45.187.202.0 24
`;

async function main() {
  const results: Array<{ name: string; ok: boolean; error?: string }> = [];
  const run = async (name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`✓ ${name}`);
    } catch (error) {
      results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
      console.log(`✗ ${name} — ${error instanceof Error ? error.message : error}`);
    }
  };

  await run("circuit policy simple", () => {
    const p = parseCircuitPolicyName("C01-EXPORT-IPV4");
    assert(p?.circuitId === "01", "circuit 01");
    assert(p?.function === "EXPORT", "export");
  });

  await run("community circuit parse", () => {
    const p = parseCircuitCommunity("64777:51003");
    assert(p.valid && p.circuitId === "10" && p.actionCode === "03", "P2");
  });

  await run("preserve CID zeros", () => {
    assert(buildCircuitCommunity("01", "01") === "64777:50101", "cid 01");
  });

  await run("exclusive circuit change", () => {
    const after = applyCircuitStateChange(["64777:50101", "64777:51001", "64777:51601"], "10", "03");
    assert(!after.communities.includes("64777:51001"), "removed old");
    assert(after.communities.includes("64777:51003"), "added P2");
  });

  await run("matrix builds origin row", () => {
    const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
    const graph = buildBgpPolicyGraph(parsed, FIXTURE);
    const { rows } = buildAnnouncementMatrix({
      deviceId: 1,
      parsedConfig: parsed,
      graph,
      upstreams: [
        { circuitId: "01", displayName: "INFORR", role: "provider" },
        { circuitId: "10", displayName: "EBT-MNS", role: "provider" },
      ],
      collectionAgeMinutes: 5,
      lastCollectedAt: new Date().toISOString(),
    });
    assert(rows.some((r) => r.routePolicyName.includes("ORIGIN-")), "origin row");
  });

  await run("preview blocks upstream", () => {
    const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
    const graph = buildBgpPolicyGraph(parsed, FIXTURE);
    const preview = compileAnnouncementPreview({
      request: {
        deviceId: 1,
        targetPolicyName: "C01-EXPORT-IPV4",
        node: 100,
        family: "ipv4",
        upstreamCircuitId: "01",
        newState: "p2",
      },
      parsedConfig: parsed,
      graph,
      upstreams: [{ circuitId: "01", displayName: "INFORR", role: "provider" }],
      communitySets: [],
      localAs: 268707,
    });
    assert(!preview.allowed, "blocked");
  });

  await run("community set exact match", () => {
    const desired = ["64777:50101", "64777:51003"];
    const catalog = [{ name: "CLIENTES|2G", communities: desired, normalizedHash: hashCommunitySet(desired), isShared: false }];
    assert(findExactCommunitySetMatch(desired, catalog)?.name === "CLIENTES|2G", "match");
  });

  await run("upstream audit", () => {
    const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
    const graph = buildBgpPolicyGraph(parsed, FIXTURE);
    const report = runUpstreamAudit(1, parsed, graph, 268707);
    assert(report.upstreams.length > 0, "upstream rows");
  });

  await run("apply community list", () => {
    const parsed = parseNodeApplies([" apply community community-list CLIENTES|2G"]);
    assert(parsed.communityListName === "CLIENTES|2G", "list");
  });

  await run("origin network parser", () => {
    const nets = parseBgpNetworkStatements(FIXTURE);
    assert(nets.some((n) => n.routePolicyName.startsWith("ORIGIN-")), "origin");
  });

  await run("customer policy modifiable", () => {
    const parsed = parseHuaweiPolicyDependencyPipeline(FIXTURE, "ssh_running_config");
    const c = classifyPolicy("AS269485-NICKNET-Import-V4", parseBgpNetworkStatements(FIXTURE), parsed);
    assert(c.modifiable, "customer modifiable");
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
