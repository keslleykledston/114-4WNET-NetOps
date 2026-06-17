import { createHash } from "node:crypto";
import type {
  BgpPeerCleanupAnalysis,
  BgpPeerCleanupDependency,
  BgpPeerCleanupScript,
} from "./bgp-drill-cleanup.types.js";

const REMOVABLE_DEPENDENCY_TYPES = new Set([
  "route-policy",
  "ip-prefix",
  "ipv6-prefix",
  "community-filter",
  "as-path-filter",
  "extcommunity-filter",
]);

function ensureCommands(commands: string[]): string[] {
  return [...new Set(commands.map((command) => command.trim()).filter(Boolean))];
}

function bgpFamilyForAfi(afi: string): "ipv4" | "ipv6" {
  if (afi === "ipv6") return "ipv6";
  return "ipv4";
}

function familyCommands(peerIp: string, vrf: string | null, afi: string): string[] {
  const family = bgpFamilyForAfi(afi);
  if (!vrf) {
    return [`undo peer ${peerIp}`, `y`];
  }
  return [`${family}-family vpn-instance ${vrf}`, `undo peer ${peerIp}`];
}

function normalizeRemovalStatus(dep: BgpPeerCleanupDependency & Record<string, unknown>): string {
  return String(dep.classification ?? dep.status ?? "").toLowerCase();
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

export function shouldRemoveDependency(dep: BgpPeerCleanupDependency & Record<string, unknown>): boolean {
  const status = normalizeRemovalStatus(dep);
  if (status !== "exclusive") return false;
  if (!REMOVABLE_DEPENDENCY_TYPES.has(dep.type)) return false;
  const hasSafetyFlag = dep.safeToRemove !== undefined || dep.safe_to_remove !== undefined;
  if (hasSafetyFlag && !isTruthyFlag(dep.safeToRemove) && !isTruthyFlag(dep.safe_to_remove)) return false;
  if (dep.scope === "global_control") return false;
  if (isTruthyFlag(dep.isGlobal)) return false;
  if (isTruthyFlag(dep.isProtected)) return false;
  if (isTruthyFlag(dep.dependency_warning_suppressed)) return false;
  if (isTruthyFlag(dep.expected_shared)) return false;
  if (isTruthyFlag(dep.removal_protected)) return false;
  return true;
}

function removalForDependency(dep: BgpPeerCleanupDependency): string | null {
  switch (dep.type) {
    case "route-policy":
      return `undo route-policy ${dep.name}`;
    case "ip-prefix":
      return `undo ip ip-prefix ${dep.name}`;
    case "ipv6-prefix":
      return `undo ip ipv6-prefix ${dep.name}`;
    case "community-filter":
      return dep.matchType
        ? `undo ip community-filter ${dep.matchType} ${dep.name}`
        : `undo ip community-filter ${dep.name}`;
    case "as-path-filter":
      return `undo ip as-path-filter ${dep.name}`;
    case "extcommunity-filter":
      return `undo ip extcommunity-filter ${dep.name}`;
    default:
      return null;
  }
}

function removalPriority(dep: BgpPeerCleanupDependency): number {
  switch (dep.type) {
    case "route-policy":
      return 0;
    case "ip-prefix":
      return 1;
    case "ipv6-prefix":
      return 2;
    case "community-filter":
      return 3;
    case "as-path-filter":
      return 4;
    case "extcommunity-filter":
      return 5;
    case "acl":
      return 6;
    default:
      return 9;
  }
}

function configHeader(asn: number | null): string[] {
  return ["system-view", `bgp ${asn ?? "<ASN>"}`];
}

function validationCommands(peerIp: string, vrf: string | null, afi: string, dependencies: BgpPeerCleanupDependency[]): string[] {
  const commands: string[] = [];
  if (vrf) {
    commands.push(`display bgp vpnv4 vpn-instance ${vrf} peer ${peerIp} verbose`);
    commands.push(`display bgp vpnv6 vpn-instance ${vrf} peer ${peerIp} verbose`);
  } else if (afi === "ipv6") {
    commands.push(`display bgp ipv6 peer ${peerIp} verbose`);
  } else {
    commands.push(`display bgp peer ${peerIp} verbose`);
  }
  commands.push("display current-configuration | begin bgp");
  for (const dep of dependencies) {
    commands.push(`display current-configuration | include ${dep.name}`);
  }
  return ensureCommands(commands);
}

export function buildBgpPeerCleanupScript(input: {
  analysis: BgpPeerCleanupAnalysis;
}): BgpPeerCleanupScript {
  const { analysis } = input;
  const removalCommands: string[] = [];
  if (analysis.recommendation !== "skip") {
    removalCommands.push(...configHeader(analysis.localAs ?? null));
    removalCommands.push(...familyCommands(analysis.peerIp, analysis.vrf, analysis.afi));
    removalCommands.push("quit");
    const removableDependencies = analysis.dependencies.exclusive
      .filter((dep) => shouldRemoveDependency(dep as BgpPeerCleanupDependency & Record<string, unknown>))
      .map((dep, index) => ({ dep, index }))
      .sort((left, right) => {
        const priorityDelta = removalPriority(left.dep) - removalPriority(right.dep);
        if (priorityDelta !== 0) return priorityDelta;
        return left.index - right.index;
      })
      .map((entry) => entry.dep);
    for (const dep of removableDependencies) {
      const command = removalForDependency(dep);
      if (command) removalCommands.push(command);
    }
    removalCommands.push("commit");
  }

  const validationBefore = validationCommands(
    analysis.peerIp,
    analysis.vrf,
    analysis.afi,
    [...analysis.dependencies.exclusive, ...analysis.dependencies.shared, ...analysis.dependencies.global, ...analysis.dependencies.ambiguous],
  );
  const validationAfter = validationCommands(analysis.peerIp, analysis.vrf, analysis.afi, [...analysis.dependencies.exclusive]);

  const normalized = {
    removalCommands: ensureCommands(removalCommands),
    validationBefore,
    validationAfter,
  };
  const sha256 = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  return { ...normalized, sha256 };
}

export function buildBgpPeerCleanupMarkdown(input: { analysis: BgpPeerCleanupAnalysis }): string {
  const { analysis } = input;
  const lines: string[] = [];
  lines.push(`# BGP Peer Cleanup Plan`);
  lines.push("");
  lines.push(`- Device: ${analysis.deviceId}`);
  lines.push(`- Peer: ${analysis.peerIp}`);
  lines.push(`- VRF: ${analysis.vrf ?? "global"}`);
  lines.push(`- AFI/SAFI: ${analysis.afi}/${analysis.safi}`);
  lines.push(`- State: ${analysis.state}`);
  lines.push(`- Recommendation: ${analysis.recommendation}`);
  lines.push(`- Risk: ${analysis.riskLevel}`);
  if (analysis.twin) {
    lines.push(`- Twin: ${analysis.twin.peerIp} (${analysis.twin.afi}, ${analysis.twin.state})`);
  }
  if (analysis.warnings.length > 0) {
    lines.push("");
    lines.push("## Warnings");
    for (const warning of analysis.warnings) lines.push(`- ${warning}`);
  }
  if (analysis.blockedReasons.length > 0) {
    lines.push("");
    lines.push("## Blocked Reasons");
    for (const blocked of analysis.blockedReasons) lines.push(`- ${blocked}`);
  }
  lines.push("");
  lines.push("## Dependencies");
  for (const bucket of ["exclusive", "shared", "global", "ambiguous"] as const) {
    lines.push(`### ${bucket}`);
    const deps = analysis.dependencies[bucket];
    if (!deps.length) {
      lines.push("- none");
      continue;
    }
    for (const dep of deps) {
      lines.push(`- ${dep.type} ${dep.name} (${dep.status})`);
    }
  }
  if (analysis.dependencies.global.length > 0) {
    lines.push("");
    lines.push("## GLOBAIS / PRESERVADOS");
    lines.push("Dependência global compartilhada por desenho operacional.");
  }
  lines.push("");
  lines.push("## Script");
  lines.push("```text");
  lines.push(analysis.script.removalCommands.join("\n"));
  lines.push("```");
  lines.push("");
  lines.push("## Validation Before");
  lines.push("```text");
  lines.push(analysis.script.validationBefore.join("\n"));
  lines.push("```");
  lines.push("");
  lines.push("## Validation After");
  lines.push("```text");
  lines.push(analysis.script.validationAfter.join("\n"));
  lines.push("```");
  lines.push("");
  lines.push(`SHA-256: \`${analysis.script.sha256}\``);
  return lines.join("\n");
}
