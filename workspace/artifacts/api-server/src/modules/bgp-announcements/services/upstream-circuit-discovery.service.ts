import { eq } from "drizzle-orm";
import { bgpUpstreamCircuitsTable, db } from "@workspace/db";
import type { ParsedPolicyDependencyConfig } from "../../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";
import { parseCircuitPolicyName, circuitDisplayNameFallback } from "../parsers/circuit-policy.parser.js";
import type { UpstreamColumn } from "../resolvers/announcement-matrix.resolver.js";

function inferRoleFromName(name: string): string {
  const u = name.toUpperCase();
  if (u.includes("IX") || u.includes("PTT")) return "ix";
  if (u.includes("GGC") || u.includes("OCA") || u.includes("FNA") || u.includes("CDN")) return "cdn";
  if (u.includes("PNI")) return "pni";
  return "provider";
}

function displayNameFromCircuit(circuit: NonNullable<ReturnType<typeof parseCircuitPolicyName>>): string {
  if (circuit.name) return circuit.name.replace(/_/g, "-");
  return circuitDisplayNameFallback(circuit.circuitId);
}

export function discoverUpstreamCircuits(parsedConfig: ParsedPolicyDependencyConfig): Array<{
  circuitId: string;
  displayName: string;
  shortName: string;
  role: string;
  exportPolicyV4Name: string | null;
  exportPolicyV6Name: string | null;
  importPolicyV4Name: string | null;
  importPolicyV6Name: string | null;
  localAs: number | null;
}> {
  const map = new Map<string, ReturnType<typeof discoverUpstreamCircuits>[number]>();

  for (const policy of Object.values(parsedConfig.consumers.route_policies)) {
    const circuit = parseCircuitPolicyName(policy.name);
    if (!circuit) continue;

    const existing = map.get(circuit.circuitId) ?? {
      circuitId: circuit.circuitId,
      displayName: displayNameFromCircuit(circuit),
      shortName: displayNameFromCircuit(circuit),
      role: inferRoleFromName(policy.name),
      exportPolicyV4Name: null,
      exportPolicyV6Name: null,
      importPolicyV4Name: null,
      importPolicyV6Name: null,
      localAs: parsedConfig.bgp_peer_model?.localAs ?? null,
    };

    const isV6 = circuit.family === "ipv6" || /IPV6|V6/i.test(policy.name);
    if (circuit.function === "EXPORT") {
      if (isV6) existing.exportPolicyV6Name = policy.name;
      else existing.exportPolicyV4Name = policy.name;
    } else {
      if (isV6) existing.importPolicyV6Name = policy.name;
      else existing.importPolicyV4Name = policy.name;
    }

    map.set(circuit.circuitId, existing);
  }

  return [...map.values()].sort((a, b) => a.circuitId.localeCompare(b.circuitId));
}

export async function ensureUpstreamCircuitsInDb(
  deviceId: number,
  parsedConfig: ParsedPolicyDependencyConfig,
): Promise<UpstreamColumn[]> {
  const discovered = discoverUpstreamCircuits(parsedConfig);

  for (const circuit of discovered) {
    await db
      .insert(bgpUpstreamCircuitsTable)
      .values({
        deviceId,
        circuitId: circuit.circuitId,
        displayName: circuit.displayName,
        shortName: circuit.shortName,
        role: circuit.role,
        localAs: circuit.localAs,
        exportPolicyV4Name: circuit.exportPolicyV4Name,
        exportPolicyV6Name: circuit.exportPolicyV6Name,
        importPolicyV4Name: circuit.importPolicyV4Name,
        importPolicyV6Name: circuit.importPolicyV6Name,
        exportPolicyName: circuit.exportPolicyV4Name ?? circuit.exportPolicyV6Name,
        enabledForMatrix: true,
        auditOnly: true,
        modifiable: false,
        source: "discovered",
        confidence: "medium",
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [bgpUpstreamCircuitsTable.deviceId, bgpUpstreamCircuitsTable.circuitId],
        set: {
          displayName: circuit.displayName,
          exportPolicyV4Name: circuit.exportPolicyV4Name,
          exportPolicyV6Name: circuit.exportPolicyV6Name,
          importPolicyV4Name: circuit.importPolicyV4Name,
          importPolicyV6Name: circuit.importPolicyV6Name,
          exportPolicyName: circuit.exportPolicyV4Name ?? circuit.exportPolicyV6Name,
          localAs: circuit.localAs,
          updatedAt: new Date(),
        },
      });
  }

  const rows = await db
    .select()
    .from(bgpUpstreamCircuitsTable)
    .where(eq(bgpUpstreamCircuitsTable.deviceId, deviceId));

  const active = rows.filter((r) => r.isActive && r.enabledForMatrix);
  if (active.length > 0) {
    return active.map((r) => ({
      circuitId: r.circuitId,
      displayName: r.displayName,
      role: r.role,
    }));
  }

  return discovered.map((c) => ({
    circuitId: c.circuitId,
    displayName: c.displayName,
    role: c.role,
  }));
}
