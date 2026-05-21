import type { Device } from "@workspace/db";
import { runSSHCommands } from "../../../../lib/ssh.js";
import { validateReadonlyCommands } from "../../huawei-vrp/commands.js";
import { parseHuaweiBgpPeers } from "../../huawei-vrp/parsers/bgp-peer-parser.js";
import { parseHuaweiCommunities } from "../../huawei-vrp/parsers/community-parser.js";
import { parseHuaweiInterfaces } from "../../huawei-vrp/parsers/interface-parser.js";
import { parseHuaweiL2vpn } from "../../huawei-vrp/parsers/l2vpn-parser.js";
import { parseHuaweiPolicies } from "../../huawei-vrp/parsers/policy-parser.js";
import { parseHuaweiVrfs } from "../../huawei-vrp/parsers/vrf-parser.js";
import type { CollectorOutput, DiscoveryContext, VrfSummary } from "../discovery.types.js";
import { emptyL2vpnSummary } from "../normalizers/l2vpn.normalizer.js";

const CONTEXT_COMMANDS: Record<DiscoveryContext, string[]> = {
  interfaces: [
    "display current-configuration interface",
    "display interface brief",
    "display interface description",
  ],
  bgp: [
    "display current-configuration configuration bgp",
    "display bgp peer",
    "display bgp vpnv4 all peer",
    "display bgp vpnv6 all peer",
  ],
  l2vpn: [
    "display mpls l2vc",
    "display vsi",
  ],
  policies: [
    "display route-policy",
    "display ip ip-prefix",
    "display current-configuration | include community",
    "display current-configuration | include ip community-filter",
    "display current-configuration | include ip community-list",
  ],
  vrfs: [
    "display current-configuration",
  ],
};

export function getDiscoverySshCommands(contexts: DiscoveryContext[]): string[] {
  return [...new Set(contexts.flatMap((context) => CONTEXT_COMMANDS[context] ?? []))];
}

export async function collectDiscoverySsh(
  device: Device,
  password: string,
  contexts: DiscoveryContext[],
): Promise<CollectorOutput> {
  const commands = getDiscoverySshCommands(contexts);
  const commandChecks = validateReadonlyCommands(commands);
  const blocked = commandChecks.filter((check) => !check.allowed);

  if (blocked.length > 0) {
    return {
      source: "ssh",
      evidenceSource: "ssh",
      success: false,
      rawOutputs: blocked.map((check) => ({ command: check.command, output: "", error: check.reason ?? "blocked" })),
      interfaces: [],
      bgpPeers: [],
      filters: [],
      communities: [],
      vrfs: [],
      l2vpn: emptyL2vpnSummary,
      warnings: blocked.map((check) => ({ level: "warning", source: "ssh", message: `${check.command}: ${check.reason ?? "blocked"}` })),
    };
  }

  const results = await runSSHCommands(
    { host: device.ipAddress, port: device.sshPort, username: device.username, password },
    commands,
  );
  const allOutput = results.map((result) => result.output).join("\n");
  const l2vpn = parseHuaweiL2vpn(allOutput);
  const vrfs: VrfSummary[] = parseHuaweiVrfs(allOutput).map((vrf) => ({
    ...vrf,
    exists: true,
    source: "ssh_live",
    confidence: "high",
    evidence: `ip vpn-instance ${vrf.name}`,
  }));

  return {
    source: "ssh",
    evidenceSource: "ssh",
    success: results.some((result) => result.output.trim().length > 0 && !result.error),
    rawOutputs: results.map((result) => ({ command: result.command, output: result.output, error: result.error })),
    interfaces: parseHuaweiInterfaces(allOutput),
    bgpPeers: parseHuaweiBgpPeers(allOutput),
    filters: parseHuaweiPolicies(allOutput),
    communities: parseHuaweiCommunities(allOutput),
    vrfs,
    l2vpn: {
      ...emptyL2vpnSummary,
      ...l2vpn,
      source: l2vpn.l2vcs.length || l2vpn.vsis.length ? "ssh_live" : emptyL2vpnSummary.source,
      confidence: l2vpn.l2vcs.length || l2vpn.vsis.length ? "high" : emptyL2vpnSummary.confidence,
    },
    warnings: results
      .filter((result) => result.error)
      .map((result) => ({ level: "warning", source: "ssh", message: `${result.command}: ${result.error}` })),
  };
}
