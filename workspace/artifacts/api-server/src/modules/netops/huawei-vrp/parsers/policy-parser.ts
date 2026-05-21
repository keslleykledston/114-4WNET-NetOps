import type { NetopsFilter } from "../../types.js";

export function parseHuaweiPolicies(output: string): NetopsFilter[] {
  const filters: NetopsFilter[] = [];

  for (const line of output.split(/\r?\n/)) {
    const routePolicy = line.match(/^\s*route-policy\s+(\S+)/i);
    if (routePolicy) {
      filters.push({ name: routePolicy[1], type: "route-policy", entries: [], source: "ssh" });
      continue;
    }

    const ipPrefix = line.match(/^\s*ip ip-prefix\s+(\S+)/i);
    if (ipPrefix) {
      filters.push({ name: ipPrefix[1], type: "ip-prefix", entries: [], source: "ssh" });
    }
  }

  return filters;
}
