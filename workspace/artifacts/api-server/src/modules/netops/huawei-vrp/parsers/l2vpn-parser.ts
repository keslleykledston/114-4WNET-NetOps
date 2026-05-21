import type { L2vcSummary, VsiSummary } from "../../device-discovery/discovery.types.js";

export function parseHuaweiL2vpn(output: string): { l2vcs: L2vcSummary[]; vsis: VsiSummary[] } {
  const l2vcs: L2vcSummary[] = [];
  const vsis: VsiSummary[] = [];
  let currentVsi: VsiSummary | null = null;
  let currentInterface: string | null = null;

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      currentVsi = null;
      currentInterface = null;
      continue;
    }

    const interfaceHeader = trimmed.match(/^interface\s+(?<iface>\S+)/i);
    if (interfaceHeader?.groups) {
      currentInterface = interfaceHeader.groups.iface;
      currentVsi = null;
      continue;
    }

    const l2vc =
      (currentInterface
        ? trimmed.match(/^\bmpls\s+l2vc\s+(?<peer>[0-9a-fA-F:.]+)\s+(?<vc>\d+)(?:.*?(?<state>up|down|active|inactive))?$/i)
        : null) ??
      trimmed.match(/^interface\s+(?<iface>\S+).*?\bmpls\s+l2vc\s+(?<peer>[0-9a-fA-F:.]+)\s+(?<vc>\d+)(?:.*?(?<state>up|down|active|inactive))?$/i) ??
      trimmed.match(/^(?<iface>\S+).*?(?:peer|remote)\s+(?<peer>[0-9a-fA-F:.]+).*?(?:vc|service)\s*(?:id)?\s*[: ]\s*(?<vc>\d+).*?(?<state>up|down|active|inactive)?$/i);
    if (l2vc?.groups) {
      l2vcs.push({
        name: l2vc.groups.iface ?? currentInterface ?? "unknown",
        vcId: l2vc.groups.vc ?? null,
        state: l2vc.groups.state ?? null,
        source: "ssh_live",
        confidence: "high",
        evidence: trimmed.slice(0, 240),
      });
      continue;
    }

    const vsi = trimmed.match(/^VSI\s+(?<name>\S+)(?:.*?(?<state>up|down|active|inactive))?$/i) ?? trimmed.match(/^vsi\s+(?<name>\S+)(?:.*?(?<state>up|down|active|inactive))?$/i);
    if (vsi?.groups) {
      currentVsi = {
        name: vsi.groups.name,
        state: vsi.groups.state ?? null,
        source: "ssh_live",
        confidence: "high",
        evidence: trimmed.slice(0, 240),
      };
      vsis.push(currentVsi);
      continue;
    }

    if (currentVsi && /^(up|down|active|inactive)$/i.test(trimmed) && currentVsi.state === null) {
      currentVsi.state = trimmed.toLowerCase() as VsiSummary["state"];
    }
  }

  return { l2vcs, vsis };
}
