import type { L2DeviceRoleFamily, L2VsiPeer, ParsedL2Circuit } from "../l2circuits.types.js";
import { truncateL2Evidence } from "../redact-l2-output.js";
import { normalizeServiceVlanId } from "../../netops/service-vlan-policy.js";
import { addPseudowireEvidence, addVsiEvidence } from "./classification.helpers.js";
import { applyVsiMultipointToParsed } from "./vsi-multipoint.helpers.js";

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
      circuitType === "vpws" && vcId && /^\d+$/.test(vcId) ? normalizeServiceVlanId(vcId) ?? undefined : undefined;

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

const PEER_FIELD_KEYS = new Set([
  "session",
  "pw state",
  "vc label",
  "local vc label",
  "remote vc label",
  "tunnel id",
  "out interface",
  "last up time",
  "negotiation-vc-id",
  "primary or secondary",
]);

function assignPeerField(peer: L2VsiPeer, key: string, value: string): void {
  switch (key) {
    case "session":
      peer.session_state = value;
      break;
    case "pw state":
      peer.pw_state = value;
      break;
    case "vc label":
      peer.vc_label = value;
      break;
    case "local vc label":
      peer.local_vc_label = value;
      break;
    case "remote vc label":
      peer.remote_vc_label = value;
      break;
    case "tunnel id":
      peer.tunnel_id = value;
      break;
    case "out interface":
      peer.out_interface = value;
      break;
    case "last up time":
      peer.last_up_time = value;
      break;
    default:
      break;
  }
}

function parseS6730VsiBlock(block: string, role: L2DeviceRoleFamily): ParsedL2Circuit | null {
  const headerFields: Record<string, string> = {};
  const peers: L2VsiPeer[] = [];
  let currentPeer: L2VsiPeer | null = null;
  let inPeerSection = false;

  for (const line of block.split(/\r?\n/)) {
    const peerStart = line.match(/^\s*(\*+)\s*Peer Router ID\s*:\s*(.+)$/i);
    if (peerStart) {
      if (currentPeer?.peer_ip) peers.push(currentPeer);
      currentPeer = {
        peer_ip: peerStart[2].trim(),
        primary: true,
      };
      inPeerSection = true;
      continue;
    }

    const genericPeerStart = line.match(/^\s*Peer Router ID\s*:\s*(.+)$/i);
    if (genericPeerStart && !inPeerSection) {
      if (currentPeer?.peer_ip) peers.push(currentPeer);
      currentPeer = { peer_ip: genericPeerStart[1].trim() };
      inPeerSection = true;
      continue;
    }

    const match = line.match(/^\s*(?:\*+)?\s*([^:]+?)\s*:\s*(.+)$/);
    if (!match) continue;

    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();

    if (inPeerSection && currentPeer && PEER_FIELD_KEYS.has(key)) {
      assignPeerField(currentPeer, key, value);
      continue;
    }

    if (!inPeerSection) {
      headerFields[key] = value;
    } else if (currentPeer && PEER_FIELD_KEYS.has(key)) {
      assignPeerField(currentPeer, key, value);
    }
  }

  if (currentPeer?.peer_ip) peers.push(currentPeer);

  const vsiName = headerFields["vsi name"];
  if (!vsiName) return null;

  const encapsulation = headerFields["encapsulation type"];
  const circuitType =
    encapsulation?.toLowerCase().includes("vlan") && headerFields["p2p vsi"] === "disable" ? "vsi" : "vpls";

  if (!headerFields["vsi id"] && peers.length === 0) return null;

  const base = addVsiEvidence(
    {
      circuitType,
      serviceId: `vsi-${headerFields["vsi id"] ?? vsiName}`,
      name: vsiName,
      vsiName,
      vsiId: headerFields["vsi id"],
      description: headerFields["vsi description"],
      localInterface: headerFields["bound interface"] ?? headerFields["interface"],
      vsiState: headerFields["vsi state"],
      adminStatus: headerFields["vsi state"],
      peers,
      rawEvidence: truncateL2Evidence(block.trim()),
    },
    role,
  );

  if (peers.length > 0) {
    return applyVsiMultipointToParsed(base);
  }

  const session = headerFields["session"];
  const peerRouterId = headerFields["peer router id"];
  return applyVsiMultipointToParsed({
    ...base,
    peerIp: peerRouterId,
    operStatus: session ?? headerFields["vsi state"],
    pwStatus: headerFields["pw state"] ?? session,
    peers: peerRouterId
      ? [
          {
            peer_ip: peerRouterId,
            session_state: session,
            pw_state: headerFields["pw state"] ?? session,
            primary: true,
          },
        ]
      : [],
  });
}

export function parseS6730VsiVerbose(output: string, role: L2DeviceRoleFamily = "SWITCH"): ParsedL2Circuit[] {
  if (!/\bVSI Name\s*:/i.test(output)) return [];

  const circuits: ParsedL2Circuit[] = [];
  const blocks = output.split(/(?=^\s*\*{0,3}\s*VSI Name\s*:)/m);

  for (const block of blocks) {
    if (!/\bVSI Name\s*:/i.test(block)) continue;
    const circuit = parseS6730VsiBlock(block, role);
    if (circuit) circuits.push(circuit);
  }

  return circuits;
}
