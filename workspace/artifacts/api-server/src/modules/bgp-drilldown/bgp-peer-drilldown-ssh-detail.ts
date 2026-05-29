import type { SSHCommandResult } from "../../lib/ssh.js";
import type { BgpPeerDrilldownResult } from "./bgp-peer-drilldown.types.js";

export const BGP_DRILLDOWN_SSH_DETAIL_DISABLED = "BGP_DRILLDOWN_SSH_DETAIL_DISABLED";

export interface BgpPeerSshDetailRequest {
  includePeerVerbose: boolean;
  includeRoutePolicies: boolean;
  includePolicyObjects: boolean;
}

export interface BgpPeerSshDetailEvidence {
  command: string;
  output: string;
  error?: string;
}

export interface BgpPeerSshDetailResult {
  contractVersion: "bgp-peer-drilldown-ssh-detail-v1";
  deviceId: number;
  peer: string;
  source: "ssh_detail";
  collectedAt: string;
  requested: BgpPeerSshDetailRequest;
  commands: string[];
  evidence: BgpPeerSshDetailEvidence[];
  warnings: string[];
}

const DANGEROUS_CHARS = /[;|&`$><\r\n]/;
const BLOCKED_TOKEN = /\b(system-view|undo|reset|clear|save|commit|delete|reboot|format)\b/i;
const SAFE_NAME = /^[A-Za-z0-9_.:@-]{1,128}$/;
const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6ISH = /^[0-9A-Fa-f:]{2,64}$/;
const SAFE_HOSTNAME = /^[A-Za-z0-9_.:-]{1,128}$/;
const HEAVY_ROUTE_COMMAND = /^display\s+bgp\s+routing-table\s+peer\s+\S+\s+(received-routes|accepted-routes|advertised-routes)\b/i;

function hasUnsafeToken(value: string): boolean {
  return DANGEROUS_CHARS.test(value) || BLOCKED_TOKEN.test(value);
}

export function isSafePeerIdentifier(peer: string): boolean {
  const value = peer.trim();
  if (!value || value.length > 128 || hasUnsafeToken(value) || /\s/.test(value)) return false;
  return IPV4.test(value) || IPV6ISH.test(value) || SAFE_HOSTNAME.test(value);
}

export function isSafePolicyObjectName(name: string): boolean {
  const value = name.trim();
  return SAFE_NAME.test(value) && !hasUnsafeToken(value);
}

export function parseSshDetailRequest(body: unknown): BgpPeerSshDetailRequest | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const includePeerVerbose = record.includePeerVerbose === undefined ? true : record.includePeerVerbose === true;
  const includeRoutePolicies = record.includeRoutePolicies === undefined ? true : record.includeRoutePolicies === true;
  const includePolicyObjects = record.includePolicyObjects === undefined ? true : record.includePolicyObjects === true;
  return { includePeerVerbose, includeRoutePolicies, includePolicyObjects };
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

function dependencyCommand(type: string, name: string): string | null {
  if (!isSafePolicyObjectName(name)) return null;
  switch (type) {
    case "ip-prefix":
      return `display ip ip-prefix ${name}`;
    case "ipv6-prefix":
      return `display ip ipv6-prefix ${name}`;
    case "as-path-filter":
      return `display ip as-path-filter ${name}`;
    case "community-filter":
      return `display ip community-filter ${name}`;
    case "extcommunity-filter":
      return `display ip extcommunity-filter ${name}`;
    default:
      return null;
  }
}

export function isAllowedSshDetailCommand(command: string): boolean {
  const value = command.trim();
  if (!value || hasUnsafeToken(value) || HEAVY_ROUTE_COMMAND.test(value)) return false;
  const safe = "[A-Za-z0-9_.:@-]{1,128}";
  const patterns = [
    new RegExp(`^display bgp peer ${safe}$`),
    new RegExp(`^display bgp peer ${safe} verbose$`),
    new RegExp(`^display route-policy ${safe}$`),
    new RegExp(`^display ip ip-prefix ${safe}$`),
    new RegExp(`^display ip ipv6-prefix ${safe}$`),
    new RegExp(`^display ip as-path-filter ${safe}$`),
    new RegExp(`^display ip community-filter ${safe}$`),
    new RegExp(`^display ip extcommunity-filter ${safe}$`),
  ];
  return patterns.some((pattern) => pattern.test(value));
}

export function buildSshDetailCommands(
  drilldown: BgpPeerDrilldownResult,
  request: BgpPeerSshDetailRequest,
): { commands: string[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!isSafePeerIdentifier(drilldown.peer)) {
    return { commands: [], warnings: [`Unsafe peer identifier blocked: ${drilldown.peer}`] };
  }

  const commands: string[] = [`display bgp peer ${drilldown.peer}`];
  if (request.includePeerVerbose) commands.push(`display bgp peer ${drilldown.peer} verbose`);

  if (request.includeRoutePolicies) {
    for (const policy of drilldown.effectivePolicies) {
      if (isSafePolicyObjectName(policy.policyName)) {
        commands.push(`display route-policy ${policy.policyName}`);
      } else {
        warnings.push(`Unsafe policy name blocked: ${policy.policyName}`);
      }
    }
  }

  if (request.includePolicyObjects) {
    for (const dep of drilldown.dependencies) {
      const command = dependencyCommand(dep.dependencyType, dep.dependencyName);
      if (command) commands.push(command);
      else if (dep.dependencyType === "community-list") warnings.push(`community-list ${dep.dependencyName} skipped: no D4 allowlist command.`);
    }
  }

  const allowed = uniq(commands).filter((command) => {
    const ok = isAllowedSshDetailCommand(command);
    if (!ok) warnings.push(`Command blocked by D4 allowlist: ${command}`);
    return ok;
  });

  return { commands: allowed, warnings };
}

export function sanitizeSshDetailText(value: unknown): string {
  return String(value ?? "")
    .replace(/(password|community|token|secret)\s*[:=]\s*\S+/gi, "$1=<redacted>")
    .replace(/\b(password\s+(?:cipher|simple)|cipher|simple|community)\s+\S+/gi, "$1 <redacted>")
    .replace(/snmp-agent\s+community\s+\S+/gi, "snmp-agent community <redacted>")
    .slice(0, 50_000);
}

export function sanitizeSshDetailResults(results: SSHCommandResult[]): BgpPeerSshDetailEvidence[] {
  return results.map((result) => ({
    command: result.command,
    output: sanitizeSshDetailText(result.output),
    error: result.error ? sanitizeSshDetailText(result.error).slice(0, 1000) : undefined,
  }));
}
