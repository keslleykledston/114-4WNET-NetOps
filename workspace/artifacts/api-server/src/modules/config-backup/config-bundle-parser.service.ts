import { and, desc, eq, or } from "drizzle-orm";
import {
  collectedConfigsTable,
  connectorsTable,
  db,
  devicesTable,
  l2CircuitsTable,
  snmpSnapshotsTable,
  type Device,
} from "@workspace/db";
import { logAuditEvent } from "../../lib/audit.js";
import { parseConfig } from "../../lib/ssh.js";
import { parseHuaweiBgpPeers } from "../netops/huawei-vrp/parsers/bgp-peer-parser.js";
import { parseHuaweiInterfaces } from "../netops/huawei-vrp/parsers/interface-parser.js";
import { parseHuaweiL2Circuits } from "../l2circuits/parsers/huawei-vrp-l2.js";
import { buildCircuitKey } from "../l2circuits/normalizers/circuit-key.helpers.js";
import { enrichCircuitsWithFindings, resolveL2Findings } from "../l2circuits/normalizers/findings.resolver.js";
import { normalizeCircuits } from "../l2circuits/normalizers/status.normalizer.js";
import { mergeVsiOperationalEvidence } from "../l2circuits/parsers/vsi-multipoint.helpers.js";
import type { NormalizedL2Circuit } from "../l2circuits/l2circuits.types.js";
import { normalizeServiceVlanId } from "../netops/service-vlan-policy.js";

export type ParserStatus = "SUCCESS" | "PARTIAL" | "FAILED" | "PENDING";

export type ParsedSummary = {
  bgpPeerCount: number;
  l2CircuitCount: number;
  interfaceCount: number;
  vlanCount: number;
  errors: string[];
};

const BUNDLE_SECTION_REGEX = /^! === (.+?) ===\s*$/m;

export function splitCommandBundle(rawBundle: string): Record<string, string> {
  const outputs: Record<string, string> = {};
  if (!rawBundle.trim()) return outputs;

  const sections = rawBundle.split(/\n! === /);
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;
    const headerEnd = trimmed.indexOf(" ===\n");
    if (headerEnd < 0) continue;
    let command = trimmed.slice(0, headerEnd).trim();
    if (command.startsWith("! === ")) command = command.slice(5).trim();
    const body = trimmed.slice(headerEnd + 5).trim();
    if (command) outputs[command] = body;
  }

  if (Object.keys(outputs).length === 0 && rawBundle.trim()) {
    outputs["raw"] = rawBundle.trim();
  }
  return outputs;
}

function mapOutputsForL2Parser(outputs: Record<string, string>): Record<string, string | undefined> {
  const runningConfig = outputs["display current-configuration"];
  return {
    "display mpls l2vc verbose": outputs["display mpls l2vc verbose"] ?? outputs["display mpls l2vc"],
    "display mpls l2vc": outputs["display mpls l2vc"],
    "display vsi verbose": outputs["display vsi verbose"] ?? outputs["display vsi"],
    "display interface description": outputs["display interface description"],
    "display interface brief": outputs["display interface brief"],
    "display current-configuration interface": outputs["display current-configuration interface"] ?? runningConfig,
    "display vlan": outputs["display vlan"],
  };
}

function circuitRowValues(circuit: NormalizedL2Circuit, deviceId: number, runId: string, now: Date) {
  return {
    deviceId,
    circuitType: circuit.circuitType,
    serviceId: circuit.serviceId,
    name: circuit.name,
    vcId: circuit.vcId,
    vsiName: circuit.vsiName,
    vsiId: circuit.vsiId,
    localInterface: circuit.localInterface,
    parentInterface: circuit.parentInterface,
    peerIp: circuit.primaryPeerIp ?? circuit.peerIp,
    outerVlan: circuit.outerVlan,
    innerVlan: circuit.innerVlan,
    adminStatus: circuit.adminStatus,
    operStatus: circuit.operStatus,
    pwStatus: circuit.pwStatus,
    macCount: circuit.macCount,
    description: circuit.description,
    classification: circuit.classification,
    l2Transport: circuit.l2Transport,
    deviceRoleFamily: circuit.deviceRoleFamily,
    evidenceFlags: mergeVsiOperationalEvidence(circuit.evidenceFlags, circuit),
    anomalyTags: circuit.anomalyTags ?? [],
    roleContext: circuit.roleContext,
    findings: circuit.findings,
    rawEvidence: circuit.rawEvidence,
    discoveryRunId: runId,
    lastSeen: now,
    source: "connector_ssh_bundle" as const,
  };
}

export async function persistL2CircuitsFromCommandOutputs(input: {
  deviceId: number;
  device: Device;
  outputs: Record<string, string>;
  collectedConfigId: number;
}): Promise<{ circuitCount: number; findingsCount: number }> {
  const rawOutputs = mapOutputsForL2Parser(input.outputs);
  const parsed = parseHuaweiL2Circuits(rawOutputs);
  const normalized = normalizeCircuits(parsed);
  const withFindings = enrichCircuitsWithFindings(normalized, input.deviceId);
  const allFindings = resolveL2Findings(normalized, input.deviceId);
  const runId = `bundle-l2-${input.collectedConfigId}`;
  const now = new Date();

  const existingRows = await db
    .select()
    .from(l2CircuitsTable)
    .where(eq(l2CircuitsTable.deviceId, input.deviceId));

  const existingByKey = new Map<string, (typeof existingRows)[number]>();
  for (const row of existingRows) {
    if (
      normalizeServiceVlanId(row.outerVlan) === null &&
      (row.outerVlan === 1 || row.localInterface?.toLowerCase() === "vlanif1" || row.name?.toLowerCase() === "vlanif1")
    ) {
      continue;
    }
    const key = buildCircuitKey(
      {
        circuitType: row.circuitType as NormalizedL2Circuit["circuitType"],
        localInterface: row.localInterface ?? undefined,
        outerVlan: row.outerVlan ?? undefined,
        innerVlan: row.innerVlan ?? undefined,
        vcId: row.vcId ?? undefined,
        vsiName: row.vsiName ?? undefined,
        vsiId: row.vsiId ?? undefined,
        peerIp: row.peerIp ?? undefined,
        serviceId: row.serviceId ?? undefined,
      },
      input.deviceId,
    );
    existingByKey.set(key, row);
  }

  for (const circuit of withFindings) {
    const key = buildCircuitKey(circuit, input.deviceId);
    const existing = existingByKey.get(key);
    const values = circuitRowValues(circuit, input.deviceId, runId, now);

    if (existing) {
      await db.update(l2CircuitsTable).set(values).where(eq(l2CircuitsTable.id, existing.id));
    } else {
      await db.insert(l2CircuitsTable).values({ ...values, firstSeen: now });
    }
  }

  await db
    .delete(l2CircuitsTable)
    .where(and(
      eq(l2CircuitsTable.deviceId, input.deviceId),
      or(
        eq(l2CircuitsTable.outerVlan, 1),
        eq(l2CircuitsTable.innerVlan, 1),
        eq(l2CircuitsTable.localInterface, "Vlanif1"),
        eq(l2CircuitsTable.name, "Vlanif1"),
      ),
    ));

  return { circuitCount: withFindings.length, findingsCount: allFindings.length };
}

export async function persistBgpFromCommandOutputs(input: {
  deviceId: number;
  connectorId: number;
  outputs: Record<string, string>;
  collectedConfigId: number;
}): Promise<{ peerCount: number }> {
  const peerMap = new Map<string, ReturnType<typeof parseHuaweiBgpPeers>[number]>();

  for (const [command, output] of Object.entries(input.outputs)) {
    if (!/display bgp peer/i.test(command) || !output.trim()) continue;
    for (const peer of parseHuaweiBgpPeers(output)) {
      peerMap.set(`${peer.peerIp}|${peer.vrf ?? ""}`, peer);
    }
  }

  const peers = [...peerMap.values()];
  const briefOutput = input.outputs["display interface brief"] ?? "";
  const interfaces = briefOutput ? parseHuaweiInterfaces(briefOutput) : [];

  await db.insert(snmpSnapshotsTable).values({
    deviceId: input.deviceId,
    collector: "ssh_bundle",
    collectorVersion: "config-bundle-v1",
    success: peers.length > 0 || interfaces.length > 0,
    errorMessage: peers.length === 0 ? "No BGP peers parsed from bundle" : null,
    interfacesJson: interfaces.length > 0 ? JSON.stringify(interfaces) : null,
    bgpPeersJson: peers.length > 0 ? JSON.stringify(peers) : null,
    vrfsJson: JSON.stringify({ collectedConfigId: input.collectedConfigId, connectorId: input.connectorId }),
  });

  return { peerCount: peers.length };
}

export async function parseAndPersistConfigBundle(input: {
  deviceId: number;
  connectorId: number;
  collectedConfigId: number;
  connectorJobId: number;
  rawBundle: string;
  vendor: string;
  platform?: string | null;
}): Promise<{ parserStatus: ParserStatus; summary: ParsedSummary }> {
  const errors: string[] = [];
  const outputs = splitCommandBundle(input.rawBundle);
  const vendorKey = input.vendor.toLowerCase().includes("huawei") ? "huawei" : input.vendor;

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, input.deviceId)).limit(1);
  if (!device) {
    throw new Error("Device not found for config bundle parse");
  }

  let bgpPeerCount = 0;
  let l2CircuitCount = 0;
  let interfaceCount = 0;
  let vlanCount = 0;

  try {
    const genericOutputs = Object.values(outputs);
    const parsed = parseConfig(genericOutputs, vendorKey);
    const serviceVlans = parsed.vlans.filter((vlan) => normalizeServiceVlanId(vlan.id) !== null);
    vlanCount = serviceVlans.length;
    interfaceCount = parsed.interfaces.length;

    await db
      .update(collectedConfigsTable)
      .set({
        parsedVlans: serviceVlans.length > 0 ? JSON.stringify(serviceVlans) : null,
        parsedInterfaces: parsed.interfaces.length > 0 ? JSON.stringify(parsed.interfaces) : null,
        parsedBgp: parsed.bgpPeers.length > 0 ? JSON.stringify(parsed.bgpPeers) : null,
        parsedL2vpn: parsed.l2vpn.length > 0 ? JSON.stringify(parsed.l2vpn) : null,
        parsedL3vpn: parsed.l3vpn.length > 0 ? JSON.stringify(parsed.l3vpn) : null,
      })
      .where(eq(collectedConfigsTable.id, input.collectedConfigId));
  } catch (error) {
    errors.push(`generic parse: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const bgp = await persistBgpFromCommandOutputs({
      deviceId: input.deviceId,
      connectorId: input.connectorId,
      outputs,
      collectedConfigId: input.collectedConfigId,
    });
    bgpPeerCount = bgp.peerCount;
  } catch (error) {
    errors.push(`bgp persist: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const l2 = await persistL2CircuitsFromCommandOutputs({
      deviceId: input.deviceId,
      device,
      outputs,
      collectedConfigId: input.collectedConfigId,
    });
    l2CircuitCount = l2.circuitCount;
  } catch (error) {
    errors.push(`l2 persist: ${error instanceof Error ? error.message : String(error)}`);
  }

  const summary: ParsedSummary = {
    bgpPeerCount,
    l2CircuitCount,
    interfaceCount,
    vlanCount,
    errors,
  };

  let parserStatus: ParserStatus = "FAILED";
  if (errors.length === 0 && (bgpPeerCount > 0 || l2CircuitCount > 0 || outputs["display current-configuration"])) {
    parserStatus = "SUCCESS";
  } else if (bgpPeerCount > 0 || l2CircuitCount > 0 || outputs["display current-configuration"]) {
    parserStatus = "PARTIAL";
  }

  await db
    .update(collectedConfigsTable)
    .set({
      parserStatus,
      parserError: errors.length > 0 ? errors.join("; ") : null,
      parsedSummaryJson: summary,
    })
    .where(eq(collectedConfigsTable.id, input.collectedConfigId));

  await db
    .update(devicesTable)
    .set({ status: "active", lastSeen: new Date(), updatedAt: new Date() })
    .where(eq(devicesTable.id, input.deviceId));

  await logAuditEvent({
    action: "device_config_bundle_parsed",
    objectType: "device",
    objectId: String(input.deviceId),
    metadata: {
      collected_config_id: input.collectedConfigId,
      connector_job_id: input.connectorJobId,
      parser_status: parserStatus,
      ...summary,
    },
  });

  return { parserStatus, summary };
}

export async function getDeviceCollectionStatus(deviceId: number) {
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) return null;

  const [latestConfig] = await db
    .select()
    .from(collectedConfigsTable)
    .where(eq(collectedConfigsTable.deviceId, deviceId))
    .orderBy(desc(collectedConfigsTable.collectedAt))
    .limit(1);

  let connectorName: string | null = null;
  if (device.connectorId) {
    const [connector] = await db
      .select({ name: connectorsTable.name })
      .from(connectorsTable)
      .where(eq(connectorsTable.id, device.connectorId))
      .limit(1);
    connectorName = connector?.name ?? null;
  }

  const summary = (latestConfig?.parsedSummaryJson ?? null) as ParsedSummary | null;

  return {
    deviceId,
    accessMode: device.connectorId ? "connector" : "direct",
    connectorId: device.connectorId,
    connectorName,
    lastSshBundleAt: latestConfig?.collectedAt?.toISOString() ?? null,
    collectedConfigId: latestConfig?.id ?? null,
    parserStatus: latestConfig?.parserStatus ?? null,
    parserError: latestConfig?.parserError ?? null,
    parsedSummary: summary,
    bgpPeerCount: summary?.bgpPeerCount ?? 0,
    l2CircuitCount: summary?.l2CircuitCount ?? 0,
    snmpConfigured: Boolean(device.snmpCommunity?.trim()),
  };
}
