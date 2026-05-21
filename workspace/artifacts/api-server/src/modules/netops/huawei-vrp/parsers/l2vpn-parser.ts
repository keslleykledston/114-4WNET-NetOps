import type { L2vcSummary, VsiSummary } from "../../device-discovery/discovery.types.js";

export function parseHuaweiL2vpn(output: string): { l2vcs: L2vcSummary[]; vsis: VsiSummary[] } {
  const l2vcs: L2vcSummary[] = [];
  const vsis: VsiSummary[] = [];

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    const l2vc = trimmed.match(/^(?<iface>\S+).*?(?:peer|remote)\s+(?<peer>[0-9a-fA-F:.]+).*?(?:vc|service)\s*(?:id)?\s*[: ]\s*(?<vc>\d+).*?(?<state>up|down|active|inactive)?$/i);
    if (l2vc?.groups) {
      l2vcs.push({
        name: l2vc.groups.iface,
        vcId: l2vc.groups.vc ?? null,
        state: l2vc.groups.state ?? null,
        source: "ssh_live",
        confidence: "high",
        evidence: trimmed.slice(0, 240),
      });
      continue;
    }

    const vsi = trimmed.match(/^VSI\s+(?<name>\S+).*?(?<state>up|down|active|inactive)?$/i) ?? trimmed.match(/^vsi\s+(?<name>\S+).*?(?<state>up|down|active|inactive)?$/i);
    if (vsi?.groups) {
      vsis.push({
        name: vsi.groups.name,
        state: vsi.groups.state ?? null,
        source: "ssh_live",
        confidence: "high",
        evidence: trimmed.slice(0, 240),
      });
    }
  }

  return { l2vcs, vsis };
}
