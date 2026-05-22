import type { ReadonlyCommandCheck } from "../adapters/adapter-types.js";

const BLOCKED_TOKENS = [
  /\bsystem-view\b/i,
  /\bconfigure\s+terminal\b/i,
  /\bcommit\b/i,
  /\bsave\b/i,
  /\bundo\b/i,
  /\breset\b/i,
  /\bclear\s+bgp\b/i,
  /\brefresh\s+bgp\b/i,
  /\bpeer\s+\S+\s+enable\b/i,
  /\bpeer\s+\S+\s+route-policy\b/i,
  /^\s*route-policy\s+\S+/i,
  /^\s*ip\s+ip-prefix\s+\S+/i,
  /^\s*ip\s+community-filter\s+\S+/i,
];

const PEER = "(?:[0-9]{1,3}(?:\\.[0-9]{1,3}){3}|[0-9a-fA-F:]{2,})";

const ALLOWED_COMMANDS = [
  /^display current-configuration$/i,
  /^display current-configuration interface$/i,
  /^display bgp peer$/i,
  /^display bgp peer verbose$/i,
  /^display bgp ipv6 peer verbose$/i,
  /^display bgp vpnv4 all peer$/i,
  /^display bgp vpnv6 all peer$/i,
  /^display bgp ipv6 peer$/i,
  new RegExp(`^display bgp vpnv4 vpn-instance \\S+ peer verbose$`, "i"),
  new RegExp(`^display bgp vpnv6 vpn-instance \\S+ peer verbose$`, "i"),
  new RegExp(`^display bgp routing-table peer ${PEER} received-routes$`, "i"),
  new RegExp(`^display bgp routing-table peer ${PEER} advertised-routes$`, "i"),
  new RegExp(`^display bgp ipv6 routing-table peer ${PEER} received-routes$`, "i"),
  new RegExp(`^display bgp ipv6 routing-table peer ${PEER} advertised-routes$`, "i"),
  /^display current-configuration configuration bgp$/i,
  /^display current-configuration \| include community$/i,
  /^display current-configuration \| include ip community-filter$/i,
  /^display current-configuration \| include ip community-list$/i,
  new RegExp(`^display current-configuration \\| include ${PEER}$`, "i"),
  /^display interface$/i,
  /^display interface brief$/i,
  /^display interface description$/i,
  /^display ip interface brief$/i,
  /^display ipv6 interface brief$/i,
  /^display mpls l2vc$/i,
  /^display vsi$/i,
  /^display route-policy$/i,
  /^display ip ip-prefix$/i,
  /^display ip community-filter(?:\s+[A-Za-z0-9_.:-]+)?$/i,
  /^display ip community-list$/i,
  /^show bgp peer$/i,
  /^show bgp ipv6 peer$/i,
  /^show interface$/i,
];

export const HUAWEI_VRP_READONLY_COMMANDS = [
  "display current-configuration",
  "display current-configuration interface",
  "display bgp peer",
  "display bgp peer verbose",
  "display bgp ipv6 peer verbose",
  "display bgp vpnv4 all peer",
  "display bgp vpnv6 all peer",
  "display bgp ipv6 peer",
  "display bgp vpnv4 vpn-instance <VRF> peer verbose",
  "display bgp vpnv6 vpn-instance <VRF> peer verbose",
  "display bgp routing-table peer <PEER> received-routes",
  "display bgp routing-table peer <PEER> advertised-routes",
  "display bgp ipv6 routing-table peer <PEER> received-routes",
  "display bgp ipv6 routing-table peer <PEER> advertised-routes",
  "display current-configuration configuration bgp",
  "display current-configuration | include community",
  "display current-configuration | include ip community-filter",
  "display current-configuration | include ip community-list",
  "display current-configuration | include <PEER>",
  "display interface",
  "display interface brief",
  "display interface description",
  "display ip interface brief",
  "display ipv6 interface brief",
  "display mpls l2vc",
  "display vsi",
  "display route-policy",
  "display ip ip-prefix",
  "display ip community-filter",
  "display ip community-filter <NAME>",
  "display ip community-list",
] as const;

export function validateReadonlyCommand(command: string): ReadonlyCommandCheck {
  const normalized = command.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return { command, allowed: false, reason: "Empty command blocked." };
  }

  if (BLOCKED_TOKENS.some((pattern) => pattern.test(normalized))) {
    return { command: normalized, allowed: false, reason: "Command contains blocked configuration or destructive token." };
  }

  if (!/^(display|show)\b/i.test(normalized)) {
    return { command: normalized, allowed: false, reason: "Only display/show read-only commands are allowed." };
  }

  if (!ALLOWED_COMMANDS.some((pattern) => pattern.test(normalized))) {
    return { command: normalized, allowed: false, reason: "Command is not in Huawei VRP read-only allowlist." };
  }

  return { command: normalized, allowed: true, reason: null };
}

export function validateReadonlyCommands(commands: string[]): ReadonlyCommandCheck[] {
  return commands.map(validateReadonlyCommand);
}
