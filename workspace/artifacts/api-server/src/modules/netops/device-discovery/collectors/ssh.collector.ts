import { desc, eq } from "drizzle-orm";
import { collectedConfigsTable, db, type Device } from "@workspace/db";
import { splitCommandBundle } from "../../../config-backup/config-bundle-parser.service.js";
import { deviceUsesConnector } from "../../../connectors/connector-execution.service.js";
import { runSSHCommandsForDevice } from "../../../connectors/connector-aware-transport.js";
import { validateReadonlyCommands } from "../../huawei-vrp/commands.js";
import { parseHuaweiBgpPeers } from "../../huawei-vrp/parsers/bgp-peer-parser.js";
import { parseHuaweiCommunities } from "../../huawei-vrp/parsers/community-parser.js";
import { parseHuaweiInterfaces } from "../../huawei-vrp/parsers/interface-parser.js";
import { parseHuaweiL2vpn } from "../../huawei-vrp/parsers/l2vpn-parser.js";
import { parseHuaweiPolicies } from "../../huawei-vrp/parsers/policy-parser.js";
import { parseHuaweiVrfs } from "../../huawei-vrp/parsers/vrf-parser.js";
import type { CollectorOutput, DiscoveryContext, VrfSummary } from "../discovery.types.js";
import { emptyL2vpnSummary } from "../normalizers/l2vpn.normalizer.js";

const SSH_OPTIONS = { commandTimeoutMs: 180_000, sessionTimeoutMs: 300_000 };

const BUNDLE_COMMAND_ALIASES: Record<string, string[]> = {
  "display mpls l2vc": ["display mpls l2vc verbose", "display mpls l2vc"],
  "display vsi": ["display vsi verbose", "display vsi"],
};

const CONTEXT_COMMANDS: Record<DiscoveryContext, string[]> = {
  interfaces: ["display interface brief", "display interface description"],
  bgp: ["display bgp peer", "display bgp peer verbose", "display bgp ipv6 peer verbose"],
  l2vpn: ["display mpls l2vc", "display vsi"],
  policies: ["display route-policy", "display ip ip-prefix"],
  vrfs: [],
};

export function getDiscoverySshCommands(contexts: DiscoveryContext[]): string[] {
  const specificCommands = [...new Set(contexts.flatMap((context) => CONTEXT_COMMANDS[context] ?? []))];
  return [...new Set(["display current-configuration", ...specificCommands])];
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

function parseVrfNameFromCommand(command: string): string | null {
  const normalized = normalizeCommand(command);
  const match = /^display bgp vpnv(?:4|6) vpn-instance (\S+) peer verbose$/i.exec(normalized);
  return match ? match[1] : null;
}

function isBgpCommand(command: string): boolean {
  const normalized = normalizeCommand(command);
  return (
    normalized === "display bgp peer"
    || normalized === "display bgp peer verbose"
    || normalized === "display bgp ipv6 peer verbose"
    || /^display bgp vpnv(?:4|6) vpn-instance \S+ peer verbose$/i.test(normalized)
  );
}

function parseBgpPeersFromResults(results: Array<{ command: string; output: string }>) {
  const peers = [];
  for (const result of results) {
    if (!isBgpCommand(result.command)) continue;
    const vrfName = parseVrfNameFromCommand(result.command) ?? undefined;
    peers.push(...parseHuaweiBgpPeers(result.output, { vrfName }));
  }
  return peers;
}

function buildVrfBgpCommands(vrfs: VrfSummary[]): string[] {
  const commands: string[] = [];
  for (const vrf of vrfs) {
    commands.push(`display bgp vpnv4 vpn-instance ${vrf.name} peer verbose`);
    commands.push(`display bgp vpnv6 vpn-instance ${vrf.name} peer verbose`);
  }
  return [...new Set(commands)];
}

function bundleOutputForCommand(bundle: Record<string, string>, command: string): string {
  const normalized = normalizeCommand(command);
  if (bundle[normalized]) return bundle[normalized];
  for (const alias of BUNDLE_COMMAND_ALIASES[normalized] ?? []) {
    if (bundle[alias]) return bundle[alias];
  }
  return "";
}

function resultsFromBundle(bundle: Record<string, string>, commands: string[]) {
  return commands.map((command) => ({
    command,
    output: bundleOutputForCommand(bundle, command),
    error: undefined as string | undefined,
  }));
}

async function loadLatestConnectorBundle(deviceId: number): Promise<string | null> {
  const [cfg] = await db
    .select({ rawConfig: collectedConfigsTable.rawConfig, source: collectedConfigsTable.source })
    .from(collectedConfigsTable)
    .where(eq(collectedConfigsTable.deviceId, deviceId))
    .orderBy(desc(collectedConfigsTable.collectedAt))
    .limit(1);
  if (!cfg?.rawConfig?.trim() || cfg.source !== "connector_ssh_bundle") return null;
  return cfg.rawConfig;
}

function buildCollectorOutput(allResults: Array<{ command: string; output: string; error?: string }>, bundleNote?: string): CollectorOutput {
  const runningConfigOutput = allResults.find((result) => normalizeCommand(result.command) === "display current-configuration")?.output ?? "";
  const allOutput = allResults.map((result) => result.output).join("\n");
  const l2vpn = parseHuaweiL2vpn(allOutput);

  return {
    source: "ssh",
    evidenceSource: "ssh",
    success: allResults.some((result) => result.output.trim().length > 0 && !result.error),
    rawOutputs: allResults.map((result) => ({ command: result.command, output: result.output, error: result.error })),
    interfaces: parseHuaweiInterfaces(allOutput),
    bgpPeers: parseBgpPeersFromResults(allResults),
    filters: parseHuaweiPolicies(allOutput),
    communities: parseHuaweiCommunities(runningConfigOutput || allOutput),
    vrfs: parseHuaweiVrfs(runningConfigOutput).map((vrf) => ({
      ...vrf,
      exists: true,
      source: "ssh_live" as const,
      confidence: "high" as const,
      evidence: `ip vpn-instance ${vrf.name}`,
    })),
    l2vpn: {
      ...emptyL2vpnSummary,
      ...l2vpn,
      source: l2vpn.l2vcs.length || l2vpn.vsis.length ? "ssh_live" : emptyL2vpnSummary.source,
      confidence: l2vpn.l2vcs.length || l2vpn.vsis.length ? "high" : emptyL2vpnSummary.confidence,
    },
    warnings: [
      ...(bundleNote ? [{ level: "info" as const, source: "ssh" as const, message: bundleNote }] : []),
      ...allResults
        .filter((result) => result.error)
        .map((result) => ({ level: "warning" as const, source: "ssh" as const, message: `${result.command}: ${result.error}` })),
    ],
  };
}

export async function collectDiscoverySsh(
  device: Device,
  _password: string,
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

  let results: Array<{ command: string; output: string; error?: string }> = [];
  let bundleNote: string | undefined;

  if (deviceUsesConnector(device)) {
    const rawBundle = await loadLatestConnectorBundle(device.id);
    if (rawBundle) {
      const bundle = splitCommandBundle(rawBundle);
      results = resultsFromBundle(bundle, commands);
      const missing = commands.filter((command) => !results.find((row) => normalizeCommand(row.command) === normalizeCommand(command) && row.output.trim()));
      if (missing.length > 0) {
        const supplemental = await runSSHCommandsForDevice(device, missing, SSH_OPTIONS);
        results = [
          ...results.filter((row) => row.output.trim()),
          ...supplemental,
        ];
      }
      bundleNote = "SSH bundle connector reutilizado; comandos ausentes coletados via connector";
    }
  }

  if (results.length === 0) {
    results = await runSSHCommandsForDevice(device, commands, SSH_OPTIONS);
  }

  const runningConfigOutput = results.find((result) => normalizeCommand(result.command) === "display current-configuration")?.output ?? "";
  const vrfs: VrfSummary[] = parseHuaweiVrfs(runningConfigOutput).map((vrf) => ({
    ...vrf,
    exists: true,
    source: "ssh_live",
    confidence: "high",
    evidence: `ip vpn-instance ${vrf.name}`,
  }));

  const bgpVrfResults = contexts.includes("bgp") && vrfs.length > 0
    ? await runSSHCommandsForDevice(device, buildVrfBgpCommands(vrfs), SSH_OPTIONS)
    : [];

  return buildCollectorOutput([...results, ...bgpVrfResults], bundleNote);
}
