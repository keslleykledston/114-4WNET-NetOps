import type { L2DeviceRoleFamily, ParsedL2Circuit } from "../l2circuits.types.js";
import { truncateL2Evidence } from "../redact-l2-output.js";
import { addPseudowireEvidence, addVsiEvidence } from "./classification.helpers.js";

export interface S6730L2vcSummary {
  total?: number;
  up?: number;
  down?: number;
}

export function parseS6730L2vcSummary(output: string): S6730L2vcSummary {
  const match = output.match(/Total LDP VC\s*:\s*(\d+)\s+(\d+)\s+up\s+(\d+)\s+down/i);
  if (!match) return {};
  return {
    total: parseInt(match[1], 10),
    up: parseInt(match[2], 10),
    down: parseInt(match[3], 10),
  };
}

export function isS6730L2vcFormat(output: string): boolean {
  return /^\s*\*client interface\s*:/im.test(output) || /^\s+destination\s*:/im.test(output);
}

export function parseS6730MplsL2vc(output: string, role: L2DeviceRoleFamily = "SWITCH"): ParsedL2Circuit[] {
  if (!isS6730L2vcFormat(output)) return [];

  const circuits: ParsedL2Circuit[] = [];
  const blocks = output.split(/(?=^\s*\*client interface\s*:)/m);

  for (const block of blocks) {
    if (!/client interface\s*:/i.test(block)) continue;

    const fields = parseS6730BlockFields(block);
    const client = parseClientInterface(fields["client interface"]);
    const vcType = fields["vc type"];
    const vcState = fields["vc state"];
    const acStatus = fields["ac status"];
    const sessionState = fields["session state"];
    const remoteForwarding = fields["remote forwarding state"];
    const linkState = fields["link state"];
    const vcId = fields["vc id"];
    const destination = fields["destination"];

    if (!vcId || !destination || !client?.interface) continue;

    const circuitType = vcType?.toLowerCase().includes("vlan") ? "vpws" : "l2vc";
    const operStatus = deriveS6730OperStatus({
      vcState,
      acStatus,
      sessionState,
      remoteForwarding,
      linkState,
    });

    const outerVlan =
      circuitType === "vpws" && vcId && /^\d+$/.test(vcId) ? parseInt(vcId, 10) : undefined;

    circuits.push(addPseudowireEvidence({
      circuitType,
      serviceId: `${circuitType}-${vcId}@${destination ?? "unknown"}`,
      name: `L2VC-${vcId}`,
      vcId,
      peerIp: destination,
      localInterface: client?.interface,
      outerVlan,
      adminStatus: acStatus ?? sessionState,
      operStatus,
      pwStatus: vcState,
      acStatus,
      sessionState,
      remoteForwardingState: remoteForwarding,
      rawEvidence: truncateL2Evidence(block.trim()),
    }, role));
  }

  return circuits;
}

function parseS6730BlockFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^\s{0,2}(?:\*+)?\s*([^:]+?)\s*:\s*(.+)$/);
    if (!match) continue;
    fields[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return fields;
}

function parseClientInterface(value?: string): { interface?: string; linkState?: string } | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\S+)\s+is\s+(up|down)/i);
  if (!match) {
    return { interface: value.split(/\s+/)[0] };
  }
  return { interface: match[1], linkState: match[2].toLowerCase() };
}

export function deriveS6730OperStatus(input: {
  vcState?: string;
  acStatus?: string;
  sessionState?: string;
  remoteForwarding?: string;
  linkState?: string;
}): string {
  const vc = input.vcState?.toLowerCase().trim();
  const link = input.linkState?.toLowerCase().trim();
  const remote = input.remoteForwarding?.toLowerCase().trim();
  const ac = input.acStatus?.toLowerCase().trim();
  const session = input.sessionState?.toLowerCase().trim();

  if (vc === "down" || link === "down") return "down";

  if (remote === "not forwarding") {
    if (session === "up" && ac === "up" && vc === "up") return "partial";
    return "partial";
  }

  if (vc === "up" && ac === "up" && remote === "forwarding") return "up";

  if (vc === "up") return "up";

  return vc ?? "unknown";
}

export function parseS6730VsiVerbose(output: string, role: L2DeviceRoleFamily = "SWITCH"): ParsedL2Circuit[] {
  if (!/\bVSI Name\s*:/i.test(output)) return [];

  const circuits: ParsedL2Circuit[] = [];
  const blocks = output.split(/(?=^\s*\*{0,3}\s*VSI Name\s*:)/m);

  for (const block of blocks) {
    if (!/\bVSI Name\s*:/i.test(block)) continue;

    const fields: Record<string, string> = {};
    for (const line of block.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:\*+)?\s*([^:]+?)\s*:\s*(.+)$/);
      if (!match) continue;
      fields[match[1].trim().toLowerCase()] = match[2].trim();
    }

    const vsiName = fields["vsi name"];
    if (!vsiName) continue;

    const vsiState = fields["vsi state"];
    const session = fields["session"];
    const peerRouterId = fields["peer router id"];
    const encapsulation = fields["encapsulation type"];
    const circuitType = encapsulation?.toLowerCase().includes("vlan") && fields["p2p vsi"] === "disable" ? "vsi" : "vpls";

    if (!fields["vsi id"] && !peerRouterId) continue;

    circuits.push(addVsiEvidence({
      circuitType,
      serviceId: `vsi-${fields["vsi id"] ?? vsiName}`,
      name: vsiName,
      vsiName,
      vsiId: fields["vsi id"],
      description: fields["vsi description"],
      peerIp: peerRouterId,
      adminStatus: vsiState,
      operStatus: session ?? vsiState,
      pwStatus: session,
      rawEvidence: truncateL2Evidence(block.trim()),
    }, role));
  }

  return circuits;
}
