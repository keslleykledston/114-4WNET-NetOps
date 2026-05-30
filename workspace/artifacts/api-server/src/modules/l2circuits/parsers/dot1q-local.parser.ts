import type { L2DeviceRoleFamily, ParsedL2Circuit } from "../l2circuits.types.js";
import { truncateL2Evidence } from "../redact-l2-output.js";
import { normalizeServiceVlanId } from "../../netops/service-vlan-policy.js";
import type { ParserContext } from "./classification.helpers.js";
import { buildL3RoleContext, hasL3ServiceEvidence, type L3EvidenceSnapshot } from "./l3-evidence.helpers.js";

interface ConfigInterfaceBlock extends L3EvidenceSnapshot {
  interfaceName: string;
  outerVlan?: number;
  innerVlan?: number;
  description?: string;
  veGroup?: string;
  hasBridge: boolean;
  isVlanif: boolean;
  rawBlock: string;
}

interface InterfaceDescriptionRow {
  phy: string;
  protocol: string;
  description: string;
}

export function parseVlanLocalCircuits(
  configOutput: string,
  descriptionOutput?: string,
  context?: Partial<ParserContext>,
): ParsedL2Circuit[] {
  const blocks = parseConfigInterfaceBlocks(configOutput);
  const blockByName = new Map(blocks.map((b) => [b.interfaceName, b]));
  const descriptionByInterface = descriptionOutput
    ? parseInterfaceDescriptionMap(descriptionOutput)
    : new Map<string, InterfaceDescriptionRow>();
  const role = context?.deviceRoleFamily ?? "UNKNOWN";
  const vlanUsageCount = countReferencedVlans(blocks, context);

  const circuits: ParsedL2Circuit[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    if (block.outerVlan === undefined && !block.isVlanif) continue;

    const vlanId = normalizeServiceVlanId(block.outerVlan ?? extractVlanifId(block.interfaceName));
    if (vlanId === null) continue;

    const dedupeKey = `${block.interfaceName}\0${vlanId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const ifDesc = descriptionByInterface.get(block.interfaceName);
    const mergedDescription = pickDescription(block.description, ifDesc?.description);
    const veGroup = block.veGroup ?? resolveVeGroup(block.interfaceName, blockByName);
    const vsiName = extractVsiName(mergedDescription);

    let description = mergedDescription;
    if (veGroup && !description?.includes("ve-group")) {
      description = description ? `${description} [ve-group ${veGroup}]` : `[ve-group ${veGroup}]`;
    }

    const parentInterface = getParentInterface(block.interfaceName);
    const serviceId = `${block.interfaceName}:vlan-${vlanId}`;
    const hasL2vc = context?.l2vcClientInterfaces?.has(block.interfaceName) ?? false;
    const hasVsi = context?.vsiInterfaces?.has(block.interfaceName) ?? false;
    const hasMac = context?.macVlans?.has(vlanId) ?? false;
    const hasSwitchingUse = context?.switchingVlans?.has(vlanId) ?? false;
    const hasGlobalVlan = context?.globalVlans?.has(vlanId) ?? false;
    const hasMultiInterfaceUse = (vlanUsageCount.get(vlanId) ?? 0) > 1;
    const hasValidDescription = Boolean(mergedDescription?.trim()) && !block.isVlanif;
    const hasRealL2Use =
      hasL2vc ||
      hasVsi ||
      hasMac ||
      hasSwitchingUse ||
      block.hasBridge ||
      block.hasL2Binding ||
      Boolean(veGroup) ||
      hasMultiInterfaceUse ||
      hasValidDescription;
    const missingSwitchBatch =
      ((role === "SWITCH") || (role === "ROUTER" && (context?.hasGlobalVlanEvidence ?? false))) &&
      (block.outerVlan !== undefined || block.isVlanif || hasSwitchingUse) &&
      !hasGlobalVlan;

    const evidenceFlags = buildEvidenceFlags(block, {
      hasVsi,
      hasMac,
      hasSwitchingUse,
      hasGlobalVlan,
      veGroup: Boolean(veGroup),
      mergedDescription,
    });

    const classification = classifyInterfaceBlock({
      block,
      role,
      hasL2vc,
      hasVsi,
      hasRealL2Use,
      missingSwitchBatch,
      evidenceFlags,
    });

    const roleContext =
      classification.classification === "l3_interface" || classification.classification === "l3_vrf_link"
        ? buildL3RoleContext(evidenceFlags)
        : role === "ROUTER"
          ? "router_huawei_ne"
          : role === "SWITCH"
            ? "switch_huawei_s"
            : "unknown";

    circuits.push({
      circuitType: classification.circuitType,
      serviceId,
      name: description?.trim() || block.interfaceName,
      description,
      outerVlan: vlanId,
      innerVlan: block.innerVlan,
      localInterface: block.interfaceName,
      parentInterface,
      vsiName: hasVsi ? vsiName : undefined,
      adminStatus: ifDesc?.phy,
      operStatus: ifDesc?.protocol,
      rawEvidence: truncateL2Evidence(block.rawBlock),
      classification: classification.classification,
      l2Transport: classification.l2Transport,
      deviceRoleFamily: role,
      evidenceFlags,
      anomalyTags: buildAnomalyTags({
        role,
        classification: classification.classification,
        missingSwitchBatch,
      }),
      roleContext,
    });
  }

  return circuits;
}

function buildEvidenceFlags(
  block: ConfigInterfaceBlock,
  extra: {
    hasVsi: boolean;
    hasMac: boolean;
    hasSwitchingUse: boolean;
    hasGlobalVlan: boolean;
    veGroup: boolean;
    mergedDescription?: string;
  },
) {
  return {
    hasDot1q: block.hasDot1q ?? block.outerVlan !== undefined,
    hasVcId: false,
    hasPeer: false,
    hasVsi: extra.hasVsi,
    hasIp: block.hasIpv4 || block.hasIp,
    hasIpv4: block.hasIpv4 || block.hasIp,
    hasIpv6: block.hasIpv6,
    hasIpv6Enable: block.hasIpv6Enable,
    hasOspf: block.hasOspf,
    hasIsis: block.hasIsis,
    hasBgp: block.hasBgp,
    hasRip: block.hasRip,
    hasMpls: block.hasMpls,
    hasVrf: block.hasVrf,
    hasVlanif: block.isVlanif,
    hasMac: extra.hasMac,
    hasBridge: block.hasBridge || extra.veGroup || block.hasBridgeDomain,
    hasL2Binding: block.hasL2Binding,
    hasVeGroup: extra.veGroup || Boolean(block.veGroup),
    hasBridgeDomain: block.hasBridgeDomain,
    hasDescription: Boolean(extra.mergedDescription?.trim() || block.hasDescription),
    hasMtu: block.hasMtu,
    hasStatisticEnable: block.hasStatisticEnable,
    hasSwitchingUse: extra.hasSwitchingUse,
    vlanDeclaredGlobal: extra.hasGlobalVlan,
  };
}

export function parseConfigInterfaceBlocks(output: string): ConfigInterfaceBlock[] {
  const blocks: ConfigInterfaceBlock[] = [];
  const chunks = output.split(/\n(?=interface\s+\S)/);

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed.startsWith("interface")) continue;

    const nameMatch = trimmed.match(/^interface\s+(\S+)/);
    if (!nameMatch) continue;

    const interfaceName = nameMatch[1];
    const lines = trimmed.split(/\r?\n/);
    let outerVlan: number | undefined;
    let innerVlan: number | undefined;
    let description: string | undefined;
    let veGroup: string | undefined;
    let hasIpv4 = false;
    let hasIpv6 = false;
    let hasIpv6Enable = false;
    let hasOspf = false;
    let hasIsis = false;
    let hasBgp = false;
    let hasRip = false;
    let hasMpls = false;
    let hasVrf = false;
    let hasBridge = false;
    let hasL2Binding = false;
    let hasBridgeDomain = false;
    let hasMtu = false;
    let hasStatisticEnable = false;
    const isVlanif = /^Vlanif\d+$/i.test(interfaceName);

    for (const line of lines) {
      const content = line.trim();
      const dot1qMatch = content.match(/^vlan-type\s+dot1q\s+(\d+)(?:\s+second-dot1q\s+(\d+))?/i);
      if (dot1qMatch) {
        outerVlan = normalizeServiceVlanId(dot1qMatch[1]) ?? undefined;
        if (dot1qMatch[2]) {
          innerVlan = normalizeServiceVlanId(dot1qMatch[2]) ?? undefined;
        }
      } else if (content.match(/^description\s+/i)) {
        description = content.replace(/^description\s+/i, "").trim();
      } else if (content.match(/^ve-group\s+/i)) {
        veGroup = content.replace(/^ve-group\s+/i, "").trim();
        hasBridge = true;
      } else if (/^ip address\b/i.test(content)) {
        hasIpv4 = true;
      } else if (/^ipv6 address\b/i.test(content)) {
        hasIpv6 = true;
      } else if (/^ipv6 enable\b/i.test(content)) {
        hasIpv6Enable = true;
      } else if (/\bospf\b/i.test(content)) {
        hasOspf = true;
      } else if (/\bisis\b/i.test(content)) {
        hasIsis = true;
      } else if (/\bbgp\b/i.test(content)) {
        hasBgp = true;
      } else if (/\brip\b/i.test(content)) {
        hasRip = true;
      } else if (/^ip binding vpn-instance\b/i.test(content)) {
        hasVrf = true;
      } else if (/^vpn-instance\b/i.test(content)) {
        hasVrf = true;
      } else if (/^mpls\b/i.test(content) && !/^mpls l2vc\b/i.test(content)) {
        hasMpls = true;
      } else if (/^(bridge-domain|l2\s+binding|xconnect|mpls\s+l2vc|vsi\b|l2\s+vc)\b/i.test(content)) {
        hasL2Binding = true;
        hasBridge = true;
      } else if (/^(port\s+link-type|port\s+trunk|port\s+default)\b/i.test(content)) {
        hasBridge = true;
      } else if (/^bridge-domain\b/i.test(content)) {
        hasBridgeDomain = true;
        hasBridge = true;
      } else if (/^mtu\b/i.test(content)) {
        hasMtu = true;
      } else if (/^statistic enable\b/i.test(content)) {
        hasStatisticEnable = true;
      }
    }

    blocks.push({
      interfaceName,
      outerVlan,
      innerVlan,
      description,
      veGroup,
      hasIpv4,
      hasIp: hasIpv4,
      hasIpv6,
      hasIpv6Enable,
      hasOspf,
      hasIsis,
      hasBgp,
      hasRip,
      hasMpls,
      hasVrf,
      hasBridge,
      hasL2Binding,
      hasBridgeDomain,
      hasDot1q: outerVlan !== undefined,
      hasDescription: Boolean(description?.trim()),
      hasMtu,
      hasStatisticEnable,
      hasVeGroup: Boolean(veGroup),
      isVlanif,
      rawBlock: trimmed,
    });
  }

  return blocks;
}

export function parseInterfaceDescriptionMap(output: string): Map<string, InterfaceDescriptionRow> {
  const map = new Map<string, InterfaceDescriptionRow>();
  const lines = output.split(/\r?\n/);
  let inTable = false;

  for (const line of lines) {
    if (line.startsWith("Interface ") && line.includes("PHY") && line.includes("Protocol")) {
      inTable = true;
      continue;
    }
    if (!inTable || !line.trim()) continue;

    const row = parseInterfaceDescriptionLine(line);
    if (row) {
      map.set(row.interfaceName, {
        phy: row.phy,
        protocol: row.protocol,
        description: row.description,
      });
    }
  }

  return map;
}

function parseInterfaceDescriptionLine(line: string): {
  interfaceName: string;
  phy: string;
  protocol: string;
  description: string;
} | null {
  const match = line.match(/^(\S+)\s+(\*?[\^]?down|up|\*?up|\^up)\s+(\*?[\^]?down|up|\*?up|\^up)\s*(.*)$/i);
  if (!match) return null;

  return {
    interfaceName: match[1],
    phy: match[2],
    protocol: match[3],
    description: match[4]?.trim() ?? "",
  };
}

function getParentInterface(interfaceName: string): string | undefined {
  const dotIndex = interfaceName.lastIndexOf(".");
  if (dotIndex <= 0) return undefined;
  return interfaceName.slice(0, dotIndex);
}

function resolveVeGroup(
  interfaceName: string,
  blockByName: Map<string, ConfigInterfaceBlock>,
): string | undefined {
  let current: string | undefined = interfaceName;
  while (current) {
    const block = blockByName.get(current);
    if (block?.veGroup) return block.veGroup;
    current = getParentInterface(current);
  }
  return undefined;
}

function pickDescription(configDesc?: string, ifDesc?: string): string | undefined {
  const config = configDesc?.trim();
  const iface = ifDesc?.trim();
  if (config && iface) {
    return config.length >= iface.length ? config : iface;
  }
  return config || iface || undefined;
}

function extractVsiName(description?: string): string | undefined {
  if (!description) return undefined;
  const vsiMatch = description.match(/\b([A-Z0-9_-]*-VSI)\b/i);
  return vsiMatch?.[1];
}

function extractVlanifId(interfaceName: string): number | undefined {
  const match = interfaceName.match(/^Vlanif(\d+)$/i);
  return normalizeServiceVlanId(match?.[1]) ?? undefined;
}

function countReferencedVlans(blocks: ConfigInterfaceBlock[], context?: Partial<ParserContext>): Map<number, number> {
  const counts = new Map<number, number>();
  for (const block of blocks) {
    const vlan = normalizeServiceVlanId(block.outerVlan ?? extractVlanifId(block.interfaceName));
    if (vlan === null) continue;
    counts.set(vlan, (counts.get(vlan) ?? 0) + 1);
  }
  for (const vlan of context?.switchingVlans ?? []) {
    const normalized = normalizeServiceVlanId(vlan);
    if (normalized === null) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return counts;
}

function classifyInterfaceBlock(input: {
  block: ConfigInterfaceBlock;
  role: L2DeviceRoleFamily;
  hasL2vc: boolean;
  hasVsi: boolean;
  hasRealL2Use: boolean;
  missingSwitchBatch: boolean;
  evidenceFlags: L3EvidenceSnapshot;
}): {
  circuitType: ParsedL2Circuit["circuitType"];
  classification: NonNullable<ParsedL2Circuit["classification"]>;
  l2Transport: NonNullable<ParsedL2Circuit["l2Transport"]>;
} {
  const { block, hasL2vc, hasVsi, hasRealL2Use, missingSwitchBatch, evidenceFlags } = input;

  if (hasL2vc) return { circuitType: "config_only", classification: "config_only", l2Transport: "config_only" };
  if (hasVsi) return { circuitType: "config_only", classification: "config_only", l2Transport: "config_only" };

  if (hasL3ServiceEvidence(evidenceFlags, block.rawBlock)) {
    if (block.hasVrf && !block.isVlanif) {
      return { circuitType: "l3_vrf_link", classification: "l3_vrf_link", l2Transport: "l3" };
    }
    return { circuitType: "l3_interface", classification: "l3_interface", l2Transport: "l3" };
  }

  if (missingSwitchBatch) {
    return { circuitType: "vlan_orphan", classification: "vlan_not_in_switch_batch", l2Transport: "none" };
  }
  if (hasRealL2Use) {
    return { circuitType: "vlan_local", classification: "vlan_local", l2Transport: "local_vlan" };
  }
  return {
    circuitType: "vlan_orphan",
    classification: block.isVlanif ? "vlanif_orphan" : "vlan_orphan",
    l2Transport: "none",
  };
}

function buildAnomalyTags(input: {
  role: L2DeviceRoleFamily;
  classification?: ParsedL2Circuit["classification"];
  missingSwitchBatch: boolean;
}): string[] {
  const tags: string[] = [];
  if (
    input.role === "ROUTER" &&
    ["vlan_local", "vlan_orphan", "vlanif_orphan", "config_only"].includes(String(input.classification))
  ) {
    tags.push("ROUTER_L2_VLAN_ANOMALY");
  }
  if (input.missingSwitchBatch) tags.push("VLAN_NOT_IN_SWITCH_BATCH");
  return tags;
}
