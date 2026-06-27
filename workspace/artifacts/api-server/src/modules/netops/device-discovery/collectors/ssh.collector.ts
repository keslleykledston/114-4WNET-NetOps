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
import { validateReadonlyCommands as validateReadonlyRaisecomCommands } from "../../raisecom-ros/commands.js";
import { parseRaisecomBgpPeers } from "../../raisecom-ros/parsers/bgp-peer-parser.js";
import { parseRaisecomInterfaces } from "../../raisecom-ros/parsers/interface-parser.js";
import type { CollectorOutput, DiscoveryContext, VrfSummary } from "../discovery.types.js";
import { emptyL2vpnSummary } from "../normalizers/l2vpn.normalizer.js";
import {
  getDiscoveryCommands,
  getRunningConfigCommand,
  normalizeVendorKey,
  type VendorKey,
} from "../../vendor-registry.js";

const SSH_OPTIONS = { commandTimeoutMs: 180_000, sessionTimeoutMs: 300_000 };
const GENERIC_BLOCKED_TOKENS = [/\bconfigure\b/i, /\bcommit\b/i, /\bwrite\b/i, /\berase\b/i, /\breload\b/i];

const BUNDLE_COMMAND_ALIASES: Record<string, string[]> = {
  "display mpls l2vc": ["display mpls l2vc verbose", "display mpls l2vc"],
  "display vsi": ["display vsi verbose", "display vsi"],
  "show mpls l2vc": ["show mpls l2vc", "show mpls l2vpn"],
};

export function getDiscoverySshCommands(
  contexts: DiscoveryContext[],
  vendor: string = "huawei",
  platform?: string,
): string[] {
  const vendorKey = normalizeVendorKey(vendor, platform);
  return getDiscoveryCommands(vendorKey, contexts);
}

function validateGenericReadonlyCommands(commands: string[]) {
  return commands.map((command) => {
    const normalized = normalizeCommand(command);
    if (!normalized) return { command, allowed: false, reason: "Empty command blocked." };
    if (GENERIC_BLOCKED_TOKENS.some((pattern) => pattern.test(normalized))) {
      return { command: normalized, allowed: false, reason: "Command contains blocked configuration or destructive token." };
    }
    if (!/^(show|display)\b/i.test(normalized)) {
      return { command: normalized, allowed: false, reason: "Only show/display read-only commands are allowed." };
    }
    return { command: normalized, allowed: true, reason: null };
  });
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

function parseVrfNameFromCommand(command: string): string | null {
  const normalized = normalizeCommand(command);
  const match = /^display bgp vpnv(?:4|6) vpn-instance (\S+) peer verbose$/i.exec(normalized);
  return match ? match[1] : null;
}

function isBgpCommand(command: string, vendorKey: VendorKey): boolean {
  const normalized = normalizeCommand(command);
  if (vendorKey === "huawei") {
    return (
      normalized === "display bgp peer"
      || normalized === "display bgp peer verbose"
      || normalized === "display bgp ipv6 peer verbose"
      || /^display bgp vpnv(?:4|6) vpn-instance \S+ peer verbose$/i.test(normalized)
    );
  }
  if (vendorKey === "raisecom") {
    return normalized === "show ip bgp summary" || normalized === "show bgp all summary";
  }
  return /^show .*bgp .*summary$/i.test(normalized);
}

function parseBgpPeersFromResults(results: Array<{ command: string; output: string }>, vendorKey: VendorKey) {
  const peers = [];
  for (const result of results) {
    if (!isBgpCommand(result.command, vendorKey)) continue;
    if (vendorKey === "raisecom") {
      peers.push(...parseRaisecomBgpPeers(result.output));
      continue;
    }
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

function buildCollectorOutput(
  vendorKey: VendorKey,
  allResults: Array<{ command: string; output: string; error?: string }>,
  bundleNote?: string,
): CollectorOutput {
  const runningConfigCommand = getRunningConfigCommand(vendorKey);
  const runningConfigOutput = allResults.find((result) => normalizeCommand(result.command) === normalizeCommand(runningConfigCommand))?.output ?? "";
  const allOutput = allResults.map((result) => result.output).join("\n");
  const l2vpn = vendorKey === "huawei" ? parseHuaweiL2vpn(allOutput) : emptyL2vpnSummary;
  const interfaces = vendorKey === "raisecom" ? parseRaisecomInterfaces(allOutput) : parseHuaweiInterfaces(allOutput);
  const bgpPeers = parseBgpPeersFromResults(allResults, vendorKey);
  const filters = vendorKey === "huawei" ? parseHuaweiPolicies(allOutput) : [];
  const communities = vendorKey === "huawei" ? parseHuaweiCommunities(runningConfigOutput || allOutput) : [];
  const vrfs = vendorKey === "huawei"
    ? parseHuaweiVrfs(runningConfigOutput).map((vrf) => ({
      ...vrf,
      exists: true,
      source: "ssh_live" as const,
      confidence: "high" as const,
      evidence: `ip vpn-instance ${vrf.name}`,
    }))
    : [];

  return {
    source: "ssh",
    evidenceSource: "ssh",
    success: allResults.some((result) => result.output.trim().length > 0 && !result.error),
    rawOutputs: allResults.map((result) => ({ command: result.command, output: result.output, error: result.error })),
    interfaces,
    bgpPeers,
    filters,
    communities,
    vrfs,
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
  const vendorKey = normalizeVendorKey(device.vendor, device.platform);
  const commands = getDiscoverySshCommands(contexts, device.vendor, device.platform);
  const commandChecks = vendorKey === "raisecom"
    ? validateReadonlyRaisecomCommands(commands)
    : vendorKey === "huawei"
      ? validateReadonlyCommands(commands)
      : validateGenericReadonlyCommands(commands);
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

  const runningConfigCommand = getRunningConfigCommand(vendorKey);
  const runningConfigOutput = results.find((result) => normalizeCommand(result.command) === normalizeCommand(runningConfigCommand))?.output ?? "";
  const vrfs: VrfSummary[] = vendorKey === "huawei"
    ? parseHuaweiVrfs(runningConfigOutput).map((vrf) => ({
      ...vrf,
      exists: true,
      source: "ssh_live",
      confidence: "high",
      evidence: `ip vpn-instance ${vrf.name}`,
    }))
    : [];

  const bgpVrfResults = vendorKey === "huawei" && contexts.includes("bgp") && vrfs.length > 0
    ? await runSSHCommandsForDevice(device, buildVrfBgpCommands(vrfs), SSH_OPTIONS)
    : [];

  return buildCollectorOutput(vendorKey, [...results, ...bgpVrfResults], bundleNote);
}
