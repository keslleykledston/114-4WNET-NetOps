import { createHash } from "node:crypto";
import type {
  ConfigGeneratorArtifactType,
  ConfigGeneratorBlockOutput,
  ConfigGeneratorBlockSchema,
  ConfigGeneratorDeviceScope,
  ConfigGeneratorBlockStatus,
  ConfigGeneratorRenderedBlock,
  ConfigGeneratorTemplateSchemaJson,
  ConfigGeneratorValidationFinding,
  ConfigGeneratorValidationSummary,
} from "./config-generator.types.js";
import { CONFIG_GENERATOR_GLOBAL_OBJECTS, L2VPN_PTMP_TEMPLATE_KEY, L2VPN_PTP_TEMPLATE_KEY, L2VPN_PTMP_SERVICE_TYPES, L2VPN_PTP_SERVICE_TYPES } from "./config-generator.catalog.js";
import { isVlanGloballyBlocked, isVlanOutsidePreferredRange } from "./config-generator-id-ranges.js";

type NormalizedInput = Record<string, unknown>;
export const CONFIG_GENERATOR_SECRET_PLACEHOLDER = "<SECRET_NOT_STORED>";

const IPV4_RE = /^(25[0-5]|2[0-4]\d|[01]?\d?\d)(\.(25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/;
const IPV6_RE = /^[0-9a-f:]+$/i;

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

const SECRET_KEYS = new Set(["md5", "password", "secret", "token", "key", "community", "snmpcommunity", "authorization", "credential", "cookie"]);

function isSensitiveKey(key: string) {
  const normalized = key.trim().toLowerCase();
  return SECRET_KEYS.has(normalized) || normalized.endsWith("password") || normalized.endsWith("secret") || normalized.endsWith("token") || normalized.endsWith("key");
}

export function sanitizeConfigGeneratorValueForStorage<T>(value: T): T {
  const sanitize = (current: unknown, parentKey?: string): unknown => {
    if (Array.isArray(current)) {
      return current.map((item) => sanitize(item, parentKey));
    }
    if (!current || typeof current !== "object") {
      if (parentKey && isSensitiveKey(parentKey)) return CONFIG_GENERATOR_SECRET_PLACEHOLDER;
      return current;
    }
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      output[key] = isSensitiveKey(key) ? CONFIG_GENERATOR_SECRET_PLACEHOLDER : sanitize(child, key);
    }
    return output;
  };
  return sanitize(value) as T;
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[\n,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  return Boolean(value);
}

function normalizeCircuitName(value: unknown): string {
  return normalizeString(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function isValidAsn(value: unknown): boolean {
  const parsed = parseInteger(value);
  return parsed != null && parsed >= 1 && parsed <= 4294967295;
}

function isValidIpv4(value: unknown): boolean {
  return typeof value === "string" && IPV4_RE.test(value.trim());
}

function isValidIpv6(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0 && IPV6_RE.test(value.trim());
}

function isValidPrefix(value: string): boolean {
  const [ip, mask] = value.split("/");
  const parsedMask = Number(mask);
  if (!ip || !Number.isInteger(parsedMask)) return false;
  if (ip.includes(":")) return isValidIpv6(ip) && parsedMask >= 0 && parsedMask <= 128;
  return isValidIpv4(ip) && parsedMask >= 0 && parsedMask <= 32;
}

function prefixIsBogon(value: string): boolean {
  const lower = value.toLowerCase();
  if (lower.includes(":")) return lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
  return (
    lower.startsWith("10.") ||
    lower.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(lower) ||
    lower.startsWith("100.64.") ||
    lower.startsWith("127.")
  );
}

function textHasGlobalObject(rawConfig: string | null, objectName: string): boolean {
  if (!rawConfig) return false;
  const needle = objectName.toLowerCase();
  return rawConfig.toLowerCase().includes(needle);
}

function renderTemplateString(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, path: string) => {
    const parts = path.split(".");
    let current: unknown = values;
    for (const part of parts) {
      if (!current || typeof current !== "object") return "";
      current = (current as Record<string, unknown>)[part];
    }
    if (current === null || current === undefined) return "";
    if (typeof current === "string") return current;
    if (typeof current === "number" || typeof current === "boolean") return String(current);
    if (Array.isArray(current)) return current.map((item) => String(item)).join("\n");
    return JSON.stringify(current);
  });
}

function renderBlock(
  block: ConfigGeneratorBlockSchema,
  content: string,
  status: ConfigGeneratorBlockStatus = block.statusHint ?? "new",
): ConfigGeneratorRenderedBlock {
  return {
    key: block.key,
    title: block.title,
    classification: block.classification,
    status,
    content,
  };
}

function buildCandidateCommunity(localAsn: number, circuitId: string, vlan: number): string {
  const digits = circuitId.replace(/\D+/g, "");
  const communityId = digits.length > 0 ? Number(digits) : vlan;
  return `${localAsn}:${communityId}`;
}

function collectGlobalStatus(rawConfig: string | null) {
  return CONFIG_GENERATOR_GLOBAL_OBJECTS.map((name) => ({
    name,
    present: textHasGlobalObject(rawConfig, name),
  }));
}

function renderDependencyLine(kind: "GLOBAL" | "CIRCUIT", status: "já existente" | "ausente" | "novo" | "conflito", label: string) {
  return `[${kind} / ${status}] ${label}`;
}

function renderManualLine(label: string, value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  return `[MANUAL] ${label} ${value}`;
}

function inferBlockStatus(lines: Array<string | null>, fallback: ConfigGeneratorBlockStatus = "manual"): ConfigGeneratorBlockStatus {
  return lines.some(Boolean) ? "new" : fallback;
}

function buildBgpBlocks(input: Record<string, unknown>, device: ConfigGeneratorDeviceScope): ConfigGeneratorBlockOutput {
  const circuitId = normalizeCircuitName(input.circuitId);
  const customerName = normalizeString(input.customerName);
  const localAsn = parseInteger(input.localAsn) ?? 0;
  const remoteAsn = parseInteger(input.remoteAsn) ?? 0;
  const interfaceName = normalizeString(input.interface);
  const vlan = parseInteger(input.vlan) ?? 0;
  const peerLocalIpv4 = normalizeString(input.peerLocalIpv4);
  const peerRemoteIpv4 = normalizeString(input.peerRemoteIpv4);
  const peerLocalIpv6 = normalizeString(input.peerLocalIpv6);
  const peerRemoteIpv6 = normalizeString(input.peerRemoteIpv6);
  const ipv4Prefixes = toArray(input.ipv4Prefixes);
  const ipv6Prefixes = toArray(input.ipv6Prefixes);
  const importPolicyName = normalizeString(input.importPolicyName) || `C${circuitId}_IMPORT`;
  const exportPolicyName = normalizeString(input.exportPolicyName) || `C${circuitId}_EXPORT`;
  const communityBase = normalizeString(input.communityBase) || buildCandidateCommunity(localAsn, circuitId, vlan);
  const prependProfile = normalizeString(input.prependProfile) || "P0";
  const candidateCommunity = communityBase;
  const globalStatus = collectGlobalStatus(device.latestConfig);
  const globalDependencyLines = globalStatus.map((entry) => renderDependencyLine("GLOBAL", entry.present ? "já existente" : "ausente", entry.name));
  const globalDependencies = [
    ...globalDependencyLines,
    renderDependencyLine("GLOBAL", globalStatus.some((entry) => entry.present) ? "já existente" : "ausente", "community-filter baseline"),
  ].join("\n");

  const circuitDependencyLines = [
    renderDependencyLine("CIRCUIT", "novo", `circuit ${circuitId}`),
    renderDependencyLine("CIRCUIT", "novo", `customer ${customerName}`),
    renderDependencyLine("CIRCUIT", "novo", `interface ${interfaceName}`),
    renderDependencyLine("CIRCUIT", "novo", `vlan ${vlan}`),
    renderDependencyLine("CIRCUIT", "novo", `community-filter ${candidateCommunity}`),
    renderDependencyLine("CIRCUIT", "novo", `import-policy ${importPolicyName}`),
    renderDependencyLine("CIRCUIT", "novo", `export-policy ${exportPolicyName}`),
    renderDependencyLine("CIRCUIT", "novo", `prepend-profile ${prependProfile}`),
    renderDependencyLine("CIRCUIT", "novo", `peer-local ${peerLocalIpv4}`),
    renderDependencyLine("CIRCUIT", "novo", `peer-remote ${peerRemoteIpv4}`),
    peerLocalIpv6 ? renderDependencyLine("CIRCUIT", "novo", `peer-local-v6 ${peerLocalIpv6}`) : null,
    peerRemoteIpv6 ? renderDependencyLine("CIRCUIT", "novo", `peer-remote-v6 ${peerRemoteIpv6}`) : null,
    ipv4Prefixes.length > 0 ? renderDependencyLine("CIRCUIT", "novo", `ipv4-prefixes ${ipv4Prefixes.join(", ")}`) : null,
    ipv6Prefixes.length > 0 ? renderDependencyLine("CIRCUIT", "novo", `ipv6-prefixes ${ipv6Prefixes.join(", ")}`) : null,
  ].filter(Boolean);
  const routePolicyImport = [
    `route-policy ${importPolicyName} permit node 10`,
    `  if-match community-filter ${candidateCommunity}`,
    `  apply community ${candidateCommunity}`,
    ipv4Prefixes.length > 0 ? `  apply ip-prefix ${ipv4Prefixes[0]}` : null,
    ipv6Prefixes.length > 0 ? `  apply ipv6-prefix ${ipv6Prefixes[0]}` : null,
    `  apply as-path prepend ${prependProfile}`,
  ].filter(Boolean).join("\n");

  const routePolicyExport = [
    `route-policy ${exportPolicyName} permit node 10`,
    `  if-match community-filter ${candidateCommunity}`,
    `  apply community ${candidateCommunity}`,
    `  apply as-path prepend ${prependProfile}`,
  ].join("\n");

  const peerBinding = [
    `bgp ${localAsn}`,
    `  peer ${peerRemoteIpv4} as-number ${remoteAsn}`,
    `  peer ${peerRemoteIpv4} connect-interface ${interfaceName}`,
    `  peer ${peerRemoteIpv4} description ${customerName}`,
    `  peer ${peerRemoteIpv4} route-policy ${importPolicyName} import`,
    `  peer ${peerRemoteIpv4} route-policy ${exportPolicyName} export`,
    (peerLocalIpv6 || peerRemoteIpv6) ? `  peer ${peerRemoteIpv6 || peerLocalIpv6} ipv6-family connect-interface ${interfaceName}` : null,
    input.md5 || input.md5Secret ? `  peer ${peerRemoteIpv4} password ${CONFIG_GENERATOR_SECRET_PLACEHOLDER}` : null,
  ].filter(Boolean).join("\n");

  const postcheck = [
    `display bgp peer ${peerRemoteIpv4}`,
    `display bgp routing-table peer ${peerRemoteIpv4} received-routes`,
    `display bgp routing-table peer ${peerRemoteIpv4} advertised-routes`,
    `display route-policy ${importPolicyName}`,
    `display route-policy ${exportPolicyName}`,
    `display current-configuration | include ${circuitId}`,
    customerName ? `display current-configuration | include ${customerName}` : null,
  ].filter(Boolean).join("\n");

  const rollbackPlaceholder = [
    `# rollback placeholder for C${circuitId}`,
    `# human review required before removal`,
    `# keep global objects intact`,
    `# undo peer ${peerRemoteIpv4} only after reuse check`,
  ].join("\n");

  const anyGlobalMissing = globalStatus.some((entry) => !entry.present);
  return {
    blocks: [
      renderBlock({ key: "global_dependencies", title: "Dependências globais", classification: "global", statusHint: anyGlobalMissing ? "missing" : "existing" }, globalDependencies, anyGlobalMissing ? "missing" : "existing"),
      renderBlock({ key: "circuit_dependencies", title: "Dependências do circuito", classification: "circuit", statusHint: "new" }, circuitDependencyLines.join("\n"), "new"),
      renderBlock({ key: "route_policy_import", title: "Route-policy import", classification: "circuit", statusHint: "new" }, routePolicyImport, "new"),
      renderBlock({ key: "route_policy_export", title: "Route-policy export", classification: "circuit", statusHint: "new" }, routePolicyExport, "new"),
      renderBlock({ key: "peer_binding", title: "Peer binding", classification: "circuit", statusHint: "suggested" }, peerBinding, "suggested"),
      renderBlock({ key: "postcheck", title: "Postcheck", classification: "circuit", statusHint: "manual" }, postcheck, "manual"),
      renderBlock({ key: "rollback_placeholder", title: "Rollback placeholder", classification: "circuit", statusHint: "manual" }, rollbackPlaceholder, "manual"),
    ],
    renderedConfig: "",
    postcheckCommands: postcheck,
    rollbackPlaceholder,
  };
}

function resolveSubinterfaceName(localInterface: string, vlan: number, explicit?: string): string {
  const iface = normalizeString(explicit) || normalizeString(localInterface);
  if (iface.includes(".")) return iface;
  if (iface) return `${iface}.${vlan}`;
  return `SubInterface.${vlan}`;
}

function parseRemotePeersList(value: unknown): string[] {
  return toArray(value).filter((item) => isValidIpv4(item) || item.length > 0);
}

function extractMtuFromConfig(rawConfig: string | null, interfaceName: string): number | null {
  if (!rawConfig || !interfaceName) return null;
  const lines = rawConfig.split(/\r?\n/);
  let inInterface = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const ifaceMatch = /^(?:interface|int)\s+(.+)$/i.exec(trimmed);
    if (ifaceMatch?.[1]) {
      inInterface = ifaceMatch[1].toLowerCase() === interfaceName.toLowerCase();
      continue;
    }
    if (inInterface && /^mtu\s+(\d+)/i.test(trimmed)) {
      const mtu = parseInteger(trimmed.match(/^mtu\s+(\d+)/i)?.[1]);
      if (mtu != null) return mtu;
    }
    if (inInterface && trimmed.startsWith("#")) inInterface = false;
  }
  return null;
}

function buildL2vcPtpBlocks(input: Record<string, unknown>, device: ConfigGeneratorDeviceScope): ConfigGeneratorBlockOutput {
  const circuitId = normalizeCircuitName(input.circuitId);
  const customerName = normalizeString(input.customerName);
  const localDeviceName = normalizeString(input.localDeviceName) || device.hostname;
  const localInterface = normalizeString(input.localInterface) || normalizeString(input.interface).split(".")[0] || "";
  const vlan = parseInteger(input.vlan) ?? 0;
  const subinterfaceId = parseInteger(input.subinterfaceId) ?? vlan;
  const l2vcId = parseInteger(input.l2vcId) ?? vlan;
  const interfaceName = resolveSubinterfaceName(localInterface, vlan, normalizeString(input.interface));
  const remotePeerIp = normalizeString(input.remotePeerIp) || normalizeString(input.peerRemoteIpv4);
  const remoteSite = normalizeString(input.remoteSite) || normalizeString(input.neighborSite);
  const remoteDeviceName = normalizeString(input.remoteDeviceName);
  const encapsulation = normalizeString(input.encapsulation) || normalizeString(input.mode) || "dot1q";
  const description = normalizeString(input.description) || `${customerName} L2VC ${l2vcId}`;
  const mtu = parseInteger(input.mtu);
  const controlWord = parseBoolean(input.controlWord);
  const tunnelPolicy = normalizeString(input.tunnelPolicy);
  const endpointRole = normalizeString(input.endpointRole);
  const globalStatus = collectGlobalStatus(device.latestConfig);

  const globalDependencies = [
    ...globalStatus.map((entry) => renderDependencyLine("GLOBAL", entry.present ? "já existente" : "ausente", entry.name)),
    renderDependencyLine("GLOBAL", device.latestConfig?.toLowerCase().includes("mpls") ? "já existente" : "ausente", "MPLS baseline"),
    renderDependencyLine("GLOBAL", localInterface && device.latestConfig?.toLowerCase().includes(localInterface.toLowerCase()) ? "já existente" : "ausente", `trunk baseline ${localInterface}`),
  ].join("\n");

  const circuitDependencies = [
    renderDependencyLine("CIRCUIT", "novo", `l2vc circuit ${circuitId}`),
    renderDependencyLine("CIRCUIT", "novo", `customer ${customerName}`),
    renderDependencyLine("CIRCUIT", "novo", `device ${localDeviceName}`),
    renderDependencyLine("CIRCUIT", "novo", `vlan ${vlan}`),
    renderDependencyLine("CIRCUIT", "novo", `subinterface ${subinterfaceId}`),
    renderDependencyLine("CIRCUIT", "novo", `l2vc-id ${l2vcId}`),
    remotePeerIp ? renderDependencyLine("CIRCUIT", "novo", `remote-peer ${remotePeerIp}`) : null,
    remoteSite ? renderDependencyLine("CIRCUIT", "novo", `remote-site ${remoteSite}`) : null,
    remoteDeviceName ? renderDependencyLine("CIRCUIT", "novo", `remote-device ${remoteDeviceName}`) : null,
    endpointRole ? renderDependencyLine("CIRCUIT", "novo", `endpoint-role ${endpointRole}`) : null,
  ].filter(Boolean).join("\n");

  const interfaceBinding = [
    `interface ${interfaceName}`,
    encapsulation === "qinq" ? `  encapsulation qinq ${vlan}` : encapsulation === "untagged" ? "  encapsulation untagged" : `  encapsulation dot1q ${vlan}`,
    `  description ${description}`,
    mtu ? `  mtu ${mtu}` : null,
  ].filter(Boolean).join("\n");

  const l2vcBinding = [
    `mpls l2vc ${l2vcId} ${l2vcId} remote ${remotePeerIp || "<REMOTE_PEER>"}`,
    controlWord ? "  control-word enable" : null,
    tunnelPolicy ? `  tunnel-policy ${tunnelPolicy}` : null,
  ].filter(Boolean).join("\n");

  const peerBinding = [
    remotePeerIp ? `  peer ${remotePeerIp} description ${customerName}` : "# remote peer required",
    remoteSite ? `  # remote-site ${remoteSite}` : null,
  ].filter(Boolean).join("\n");

  const postcheck = [
    "display mpls l2vc",
    `display mpls l2vc interface ${interfaceName}`,
    `display interface ${interfaceName}`,
    `display current-configuration interface ${interfaceName}`,
    `display vlan ${vlan}`,
    `display mac-address vlan ${vlan}`,
  ].join("\n");

  const rollbackPlaceholder = [
    `# rollback placeholder for L2VC ${l2vcId} / circuit ${circuitId}`,
    "# human review required before removal",
    "# do not remove global MPLS objects",
    "# do not remove physical interface or trunk baseline",
    `# do not remove vlan ${vlan} if reused by other circuits`,
    `# undo mpls l2vc ${l2vcId} only after peer reuse check`,
  ].join("\n");

  const anyGlobalMissing = globalStatus.some((entry) => !entry.present);
  return {
    blocks: [
      renderBlock({ key: "global_dependencies", title: "Dependências globais", classification: "global", statusHint: anyGlobalMissing ? "missing" : "existing" }, globalDependencies, anyGlobalMissing ? "missing" : "existing"),
      renderBlock({ key: "circuit_dependencies", title: "Dependências do circuito", classification: "circuit", statusHint: "new" }, circuitDependencies, "new"),
      renderBlock({ key: "interface_binding", title: "Interface binding", classification: "circuit", statusHint: "new" }, interfaceBinding, "new"),
      renderBlock({ key: "l2vc_binding", title: "L2VC binding", classification: "circuit", statusHint: "new" }, l2vcBinding, "new"),
      renderBlock({ key: "peer_binding", title: "Peer binding", classification: "circuit", statusHint: "suggested" }, peerBinding, remotePeerIp ? "suggested" : "missing"),
      renderBlock({ key: "postcheck", title: "Postcheck", classification: "circuit", statusHint: "manual" }, postcheck, "manual"),
      renderBlock({ key: "rollback_placeholder", title: "Rollback placeholder", classification: "circuit", statusHint: "manual" }, rollbackPlaceholder, "manual"),
    ],
    renderedConfig: "",
    postcheckCommands: postcheck,
    rollbackPlaceholder,
  };
}

function buildVsiPtmpBlocks(input: Record<string, unknown>, device: ConfigGeneratorDeviceScope): ConfigGeneratorBlockOutput {
  const circuitId = normalizeCircuitName(input.circuitId);
  const customerName = normalizeString(input.customerName);
  const vsiName = normalizeString(input.vsiName) || `VSI_${circuitId}`;
  const vsiId = parseInteger(input.vsiId) ?? parseInteger(input.vlan) ?? 0;
  const vlan = parseInteger(input.vlan) ?? vsiId;
  const subinterfaceId = parseInteger(input.subinterfaceId) ?? vlan;
  const accessInterface = normalizeString(input.accessInterface) || resolveSubinterfaceName("", vlan, normalizeString(input.interface));
  const remotePeers = parseRemotePeersList(input.remotePeers);
  const neighborSites = toArray(input.neighborSites);
  const siteRole = normalizeString(input.siteRole) || normalizeString(input.endpointRole) || "access";
  const encapsulation = normalizeString(input.encapsulation) || normalizeString(input.mode) || "dot1q";
  const description = normalizeString(input.description) || `${customerName} VSI ${vsiName}`;
  const mtu = parseInteger(input.mtu);
  const neighborSite = normalizeString(input.neighborSite);
  const globalStatus = collectGlobalStatus(device.latestConfig);

  const globalDependencies = [
    ...globalStatus.map((entry) => renderDependencyLine("GLOBAL", entry.present ? "já existente" : "ausente", entry.name)),
    renderDependencyLine("GLOBAL", device.latestConfig?.toLowerCase().includes("mpls") ? "já existente" : "ausente", "MPLS baseline"),
  ].join("\n");

  const circuitDependencies = [
    renderDependencyLine("CIRCUIT", "novo", `vsi circuit ${circuitId}`),
    renderDependencyLine("CIRCUIT", "novo", `customer ${customerName}`),
    renderDependencyLine("CIRCUIT", "novo", `vsi-name ${vsiName}`),
    renderDependencyLine("CIRCUIT", "novo", `vsi-id ${vsiId}`),
    renderDependencyLine("CIRCUIT", "novo", `vlan ${vlan}`),
    renderDependencyLine("CIRCUIT", "novo", `subinterface ${subinterfaceId}`),
    renderDependencyLine("CIRCUIT", "novo", `site-role ${siteRole}`),
    neighborSite ? renderDependencyLine("CIRCUIT", "novo", `neighbor-site ${neighborSite}`) : null,
    neighborSites.length > 0 ? renderDependencyLine("CIRCUIT", "novo", `neighbor-sites ${neighborSites.join(", ")}`) : null,
  ].filter(Boolean).join("\n");

  const vsiDefinition = [
    `vsi ${vsiName} ${vsiId}`,
    "  pwsignal ldp",
    `  vsi-id ${vsiId}`,
    ...remotePeers.map((peer) => `  peer ${peer}`),
    description ? `  description ${description}` : null,
  ].filter(Boolean).join("\n");

  const peerBinding = remotePeers.length > 0
    ? remotePeers.map((peer) => `  peer ${peer} description ${customerName}`).join("\n")
    : "# remote peers required";

  const accessBinding = [
    `interface ${accessInterface}`,
    encapsulation === "qinq" ? `  encapsulation qinq ${vlan}` : encapsulation === "untagged" ? "  encapsulation untagged" : `  encapsulation dot1q ${vlan}`,
    `  l2 binding vsi ${vsiName}`,
    mtu ? `  mtu ${mtu}` : null,
    `  description ${description}`,
  ].filter(Boolean).join("\n");

  const postcheck = [
    `display vsi name ${vsiName}`,
    "display vsi services all",
    "display mpls l2vpn vsi",
    `display current-configuration | include ${vsiName}`,
    `display interface ${accessInterface}`,
    `display vlan ${vlan}`,
  ].join("\n");

  const rollbackPlaceholder = [
    `# rollback placeholder for VSI ${vsiName} (${vsiId}) / circuit ${circuitId}`,
    "# human review required before removal",
    "# do not remove global MPLS objects",
    "# do not remove VSI if other peers remain attached",
    `# do not remove vlan ${vlan} if reused by other circuits`,
  ].join("\n");

  const anyGlobalMissing = globalStatus.some((entry) => !entry.present);
  return {
    blocks: [
      renderBlock({ key: "global_dependencies", title: "Dependências globais", classification: "global", statusHint: anyGlobalMissing ? "missing" : "existing" }, globalDependencies, anyGlobalMissing ? "missing" : "existing"),
      renderBlock({ key: "circuit_dependencies", title: "Dependências do circuito", classification: "circuit", statusHint: "new" }, circuitDependencies, "new"),
      renderBlock({ key: "vsi_definition", title: "VSI definition", classification: "circuit", statusHint: "new" }, vsiDefinition, "new"),
      renderBlock({ key: "peer_binding", title: "Peer binding", classification: "circuit", statusHint: "suggested" }, peerBinding, remotePeers.length > 0 ? "suggested" : "missing"),
      renderBlock({ key: "access_binding", title: "Access binding", classification: "circuit", statusHint: "new" }, accessBinding, "new"),
      renderBlock({ key: "postcheck", title: "Postcheck", classification: "circuit", statusHint: "manual" }, postcheck, "manual"),
      renderBlock({ key: "rollback_placeholder", title: "Rollback placeholder", classification: "circuit", statusHint: "manual" }, rollbackPlaceholder, "manual"),
    ],
    renderedConfig: "",
    postcheckCommands: postcheck,
    rollbackPlaceholder,
  };
}

function buildL2Blocks(input: Record<string, unknown>, device: ConfigGeneratorDeviceScope): ConfigGeneratorBlockOutput {
  const circuitId = normalizeCircuitName(input.circuitId);
  const customerName = normalizeString(input.customerName);
  const interfaceName = normalizeString(input.interface);
  const vlan = parseInteger(input.vlan) ?? 0;
  const description = normalizeString(input.description);
  const mtu = parseInteger(input.mtu);
  const mode = normalizeString(input.mode) || "tagged";
  const serviceType = normalizeString(input.serviceType) || "l2vpn_vlan";
  const neighborSite = normalizeString(input.neighborSite);
  const endpointRole = normalizeString(input.endpointRole);
  const peerLocalIpv4 = normalizeString(input.peerLocalIpv4);
  const peerRemoteIpv4 = normalizeString(input.peerRemoteIpv4);
  const ipv4Prefixes = toArray(input.ipv4Prefixes);
  const globalStatus = collectGlobalStatus(device.latestConfig);

  const globalDependencies = [
    ...globalStatus.map((entry) => renderDependencyLine("GLOBAL", entry.present ? "já existente" : "ausente", entry.name)),
    renderDependencyLine("GLOBAL", globalStatus.some((entry) => entry.present) ? "já existente" : "ausente", `trunk baseline ${interfaceName}`),
    renderDependencyLine("GLOBAL", "ausente", `qinq baseline ${vlan}`),
  ].join("\n");

  const circuitDependencies = [
    renderDependencyLine("CIRCUIT", "novo", `l2vpn circuit ${circuitId}`),
    renderDependencyLine("CIRCUIT", "novo", `customer ${customerName}`),
    renderDependencyLine("CIRCUIT", "novo", `interface ${interfaceName}`),
    renderDependencyLine("CIRCUIT", "novo", `vlan ${vlan}`),
    renderDependencyLine("CIRCUIT", "novo", `mode ${mode}`),
    renderDependencyLine("CIRCUIT", "novo", `service-type ${serviceType}`),
    description ? renderDependencyLine("CIRCUIT", "novo", `description ${description}`) : null,
    mtu ? renderDependencyLine("CIRCUIT", "novo", `mtu ${mtu}`) : null,
    neighborSite ? renderDependencyLine("CIRCUIT", "novo", `neighbor-site ${neighborSite}`) : null,
    endpointRole ? renderDependencyLine("CIRCUIT", "novo", `endpoint-role ${endpointRole}`) : null,
    peerLocalIpv4 ? renderDependencyLine("CIRCUIT", "novo", `peer-local ${peerLocalIpv4}`) : null,
    peerRemoteIpv4 ? renderDependencyLine("CIRCUIT", "novo", `peer-remote ${peerRemoteIpv4}`) : null,
    ipv4Prefixes.length > 0 ? renderDependencyLine("CIRCUIT", "novo", `ipv4-prefixes ${ipv4Prefixes.join(", ")}`) : null,
  ].filter(Boolean).join("\n");

  const routePolicyImport = [
    `# L2 service ${serviceType}`,
    `# import placeholder only`,
  ].join("\n");
  const routePolicyExport = [
    `# L2 service ${serviceType}`,
    `# export placeholder only`,
  ].join("\n");
  const peerBinding = [
    `interface ${interfaceName}`,
    mode === "qinq" ? `  encapsulation qinq ${vlan}` : `  encapsulation dot1q ${vlan}`,
    `  description ${description || customerName}`,
    neighborSite ? `  # neighbor-site ${neighborSite}` : null,
    endpointRole ? `  # endpoint-role ${endpointRole}` : null,
  ].join("\n");
  const postcheck = [
    `display interface ${interfaceName}`,
    `display vlan ${vlan}`,
    `display current-configuration interface ${interfaceName}`,
    `display mac-address vlan ${vlan}`,
    serviceType ? `display l2vpn service ${circuitId}` : null,
  ].filter(Boolean).join("\n");
  const rollbackPlaceholder = [
    `# rollback placeholder for L2VPN ${circuitId}`,
    `# human review required before removal`,
    `# do not remove trunk baseline`,
    `# do not remove vlan if reused`,
  ].join("\n");

  const anyGlobalMissing = globalStatus.some((entry) => !entry.present);
  return {
    blocks: [
      renderBlock({ key: "global_dependencies", title: "Dependências globais", classification: "global", statusHint: anyGlobalMissing ? "missing" : "existing" }, globalDependencies, anyGlobalMissing ? "missing" : "existing"),
      renderBlock({ key: "circuit_dependencies", title: "Dependências do circuito", classification: "circuit", statusHint: "new" }, circuitDependencies, "new"),
      renderBlock({ key: "route_policy_import", title: "Route-policy import", classification: "circuit", statusHint: "manual" }, routePolicyImport, "manual"),
      renderBlock({ key: "route_policy_export", title: "Route-policy export", classification: "circuit", statusHint: "manual" }, routePolicyExport, "manual"),
      renderBlock({ key: "peer_binding", title: "Peer binding", classification: "circuit", statusHint: "suggested" }, peerBinding, "suggested"),
      renderBlock({ key: "postcheck", title: "Postcheck", classification: "circuit", statusHint: "manual" }, postcheck, "manual"),
      renderBlock({ key: "rollback_placeholder", title: "Rollback placeholder", classification: "circuit", statusHint: "manual" }, rollbackPlaceholder, "manual"),
    ],
    renderedConfig: "",
    postcheckCommands: postcheck,
    rollbackPlaceholder,
  };
}

export function normalizeConfigGeneratorInput(input: Record<string, unknown>): NormalizedInput {
  const md5 = typeof input.md5 === "string" ? input.md5.trim() : typeof input.md5Secret === "string" ? input.md5Secret.trim() : null;
  return {
    ...input,
    circuitId: normalizeCircuitName(input.circuitId),
    customerName: normalizeString(input.customerName),
    localAsn: parseInteger(input.localAsn),
    remoteAsn: parseInteger(input.remoteAsn),
    interface: normalizeString(input.interface),
    vlan: parseInteger(input.vlan),
    peerLocalIpv4: normalizeString(input.peerLocalIpv4),
    peerRemoteIpv4: normalizeString(input.peerRemoteIpv4),
    peerLocalIpv6: normalizeString(input.peerLocalIpv6),
    peerRemoteIpv6: normalizeString(input.peerRemoteIpv6),
    ipv4Prefixes: toArray(input.ipv4Prefixes),
    ipv6Prefixes: toArray(input.ipv6Prefixes),
    md5,
    md5Secret: md5 ?? null,
    description: normalizeString(input.description),
    mtu: parseInteger(input.mtu),
    mode: normalizeString(input.mode),
    deviceName: normalizeString(input.deviceName),
    serviceType: normalizeString(input.serviceType),
    neighborSite: normalizeString(input.neighborSite),
    endpointRole: normalizeString(input.endpointRole),
    importPolicyName: normalizeString(input.importPolicyName),
    exportPolicyName: normalizeString(input.exportPolicyName),
    communityBase: normalizeString(input.communityBase),
    prependProfile: normalizeString(input.prependProfile),
    localDeviceName: normalizeString(input.localDeviceName),
    localInterface: normalizeString(input.localInterface),
    remotePeerIp: normalizeString(input.remotePeerIp) || normalizeString(input.peerRemoteIpv4),
    remoteSite: normalizeString(input.remoteSite),
    remoteDeviceName: normalizeString(input.remoteDeviceName),
    encapsulation: normalizeString(input.encapsulation),
    controlWord: parseBoolean(input.controlWord),
    tunnelPolicy: normalizeString(input.tunnelPolicy),
    allocationScope: normalizeString(input.allocationScope),
    allocationRangeKey: normalizeString(input.allocationRangeKey),
    allocationReason: normalizeString(input.allocationReason),
    l2vcId: parseInteger(input.l2vcId),
    vsiId: parseInteger(input.vsiId),
    vsiName: normalizeString(input.vsiName),
    subinterfaceId: parseInteger(input.subinterfaceId),
    accessInterface: normalizeString(input.accessInterface),
    remotePeers: parseRemotePeersList(input.remotePeers),
    siteRole: normalizeString(input.siteRole),
    neighborSites: toArray(input.neighborSites),
    dryRun: parseBoolean(input.dryRun),
  };
}

export function sanitizeConfigGeneratorInputForStorage(input: NormalizedInput): NormalizedInput {
  return sanitizeConfigGeneratorValueForStorage(structuredClone(input));
}

export function checksumJson(value: unknown): string {
  return sha256(JSON.stringify(value));
}

export function sanitizeRenderedConfig(rendered: string): string {
  return rendered.replace(/\b(password|secret|md5|token)\s+[^\n]+/gi, (_match, label: string) => `${label} ${CONFIG_GENERATOR_SECRET_PLACEHOLDER}`);
}

export function sanitizeConfigGeneratorValidationSummaryForStorage(summary: ConfigGeneratorValidationSummary): ConfigGeneratorValidationSummary {
  return sanitizeConfigGeneratorValueForStorage(structuredClone(summary));
}

export function validateConfigGeneratorTemplateCompatibility(input: {
  vendor: string;
  platform: string;
  device: ConfigGeneratorDeviceScope;
}): ConfigGeneratorValidationFinding[] {
  const vendorMatches = input.vendor.trim().toLowerCase() === input.device.vendor.trim().toLowerCase();
  const platformMatches = input.platform.trim().toLowerCase() === input.device.platform.trim().toLowerCase();
  if (vendorMatches && platformMatches) return [];
  return [{
    severity: "error",
    code: "TEMPLATE_VENDOR_MISMATCH",
    message: `Template ${input.vendor}/${input.platform} incompatible com device ${input.device.vendor}/${input.device.platform}.`,
    context: { vendor: input.vendor, platform: input.platform, deviceVendor: input.device.vendor, devicePlatform: input.device.platform },
  }];
}

export function validateDeviceTenantScope(deviceTenantId: number | null, inputTenantId: number) {
  if (deviceTenantId == null) {
    return {
      ok: false as const,
      code: "TENANT_DEVICE_MISMATCH" as const,
      error: `Device has no tenant scope.`,
    };
  }
  if (deviceTenantId !== inputTenantId) {
    return {
      ok: false as const,
      code: "TENANT_DEVICE_MISMATCH" as const,
      error: `Device does not belong to tenant ${inputTenantId}.`,
    };
  }
  return { ok: true as const };
}

export function validateConfigGeneratorInput(input: {
  serviceType: string;
  device: ConfigGeneratorDeviceScope;
  templateKey: string;
  normalizedInput: NormalizedInput;
  existingCircuitIds?: string[];
  existingCommunities?: string[];
  existingRoutePolicies?: string[];
  existingVlans?: number[];
  existingPeerRemoteIps?: string[];
  existingL2vcIds?: number[];
  existingVsiIds?: number[];
  existingSubinterfaces?: string[];
}): ConfigGeneratorValidationSummary {
  const warnings: ConfigGeneratorValidationFinding[] = [];
  const errors: ConfigGeneratorValidationFinding[] = [];
  const normalized = input.normalizedInput;
  const isPtpL2vc = input.templateKey === L2VPN_PTP_TEMPLATE_KEY || L2VPN_PTP_SERVICE_TYPES.has(input.serviceType);
  const isPtmpVsi = input.templateKey === L2VPN_PTMP_TEMPLATE_KEY || L2VPN_PTMP_SERVICE_TYPES.has(input.serviceType);

  const requiredKeys = ["circuitId", "customerName", "vlan"];
  if (input.templateKey === "huawei_vrp_bgp_customer_community") {
    requiredKeys.push("localAsn", "remoteAsn", "peerLocalIpv4", "peerRemoteIpv4", "ipv4Prefixes", "interface");
  } else if (isPtpL2vc) {
    requiredKeys.push("l2vcId", "remotePeerIp");
  } else if (isPtmpVsi) {
    requiredKeys.push("vsiName", "vsiId", "accessInterface", "remotePeers");
  } else {
    requiredKeys.push("interface");
  }
  for (const key of requiredKeys) {
    if (normalized[key] == null || normalized[key] === "" || (Array.isArray(normalized[key]) && (normalized[key] as unknown[]).length === 0)) {
      errors.push({ severity: "error", code: "missing_required_field", message: `Campo obrigatório ausente: ${key}.`, context: { field: key } });
    }
  }
  if (isPtpL2vc && !normalizeString(normalized.localInterface) && !normalizeString(normalized.interface)) {
    errors.push({ severity: "error", code: "missing_required_field", message: "Campo obrigatório ausente: localInterface ou interface.", context: { field: "localInterface" } });
  }
  if (isPtmpVsi && !normalizeString(normalized.accessInterface) && !normalizeString(normalized.interface)) {
    errors.push({ severity: "error", code: "missing_required_field", message: "Campo obrigatório ausente: accessInterface.", context: { field: "accessInterface" } });
  }

  const vlan = parseInteger(normalized.vlan);
  if (vlan == null || vlan < 2 || vlan > 4094) {
    errors.push({ severity: "error", code: "invalid_vlan", message: "VLAN inválida. Use valor entre 2 e 4094.", context: { vlan } });
  } else if (isVlanGloballyBlocked(vlan, input.serviceType)) {
    errors.push({ severity: "error", code: "vlan_blocked", message: `VLAN ${vlan} bloqueada pela política K3G.`, context: { vlan } });
  } else if (isVlanOutsidePreferredRange(vlan, input.serviceType)) {
    warnings.push({
      severity: "warning",
      code: "vlan_outside_preferred_range",
      message: `VLAN ${vlan} fora do range padrão para ${input.serviceType}.`,
      context: { vlan, serviceType: input.serviceType },
    });
  }

  const localAsn = parseInteger(normalized.localAsn);
  const remoteAsn = parseInteger(normalized.remoteAsn);
  if (input.templateKey === "huawei_vrp_bgp_customer_community") {
    if (!isValidAsn(localAsn)) {
      errors.push({ severity: "error", code: "invalid_local_asn", message: "ASN local inválido.", context: { localAsn } });
    }
    if (!isValidAsn(remoteAsn)) {
      errors.push({ severity: "error", code: "invalid_remote_asn", message: "ASN remoto inválido.", context: { remoteAsn } });
    }

    if (!isValidIpv4(normalized.peerLocalIpv4)) {
      errors.push({ severity: "error", code: "invalid_peer_local_ipv4", message: "IPv4 local inválido.", context: { peerLocalIpv4: normalized.peerLocalIpv4 } });
    }
    if (!isValidIpv4(normalized.peerRemoteIpv4)) {
      errors.push({ severity: "error", code: "invalid_peer_remote_ipv4", message: "IPv4 remoto inválido.", context: { peerRemoteIpv4: normalized.peerRemoteIpv4 } });
    }
    if (normalized.peerLocalIpv6 && !isValidIpv6(normalized.peerLocalIpv6)) {
      errors.push({ severity: "error", code: "invalid_peer_local_ipv6", message: "IPv6 local inválido.", context: { peerLocalIpv6: normalized.peerLocalIpv6 } });
    }
    if (normalized.peerRemoteIpv6 && !isValidIpv6(normalized.peerRemoteIpv6)) {
      errors.push({ severity: "error", code: "invalid_peer_remote_ipv6", message: "IPv6 remoto inválido.", context: { peerRemoteIpv6: normalized.peerRemoteIpv6 } });
    }
  }

  const routePolicies = [
    normalizeString(normalized.importPolicyName) || (input.templateKey === "huawei_vrp_bgp_customer_community" ? `C${normalizeCircuitName(normalized.circuitId)}_IMPORT` : ""),
    normalizeString(normalized.exportPolicyName) || (input.templateKey === "huawei_vrp_bgp_customer_community" ? `C${normalizeCircuitName(normalized.circuitId)}_EXPORT` : ""),
  ].filter((value): value is string => Boolean(value));
  for (const policyName of routePolicies) {
    if (policyName && textHasGlobalObject(input.device.latestConfig, policyName)) {
      errors.push({
        severity: "error",
        code: "route_policy_conflict",
        message: `Route-policy já existe no device: ${policyName}.`,
        context: { policy: policyName },
      });
    }
  }

  const interfaceToCheck = isPtpL2vc || isPtmpVsi
    ? (normalizeString(normalized.accessInterface) || normalizeString(normalized.interface) || normalizeString(normalized.localInterface))
    : normalizeString(normalized.interface);
  if (interfaceToCheck) {
    const target = interfaceToCheck.toLowerCase();
    const exactMatch = input.device.interfaceNames.some((name) => name.toLowerCase() === target);
    const parent = target.split(".")[0];
    const parentExists = Boolean(parent) && input.device.interfaceNames.some((name) => name.toLowerCase() === parent);
    const allowedNewSubif = (isPtpL2vc || isPtmpVsi) && parentExists && target.includes(".");
    if (!exactMatch && !allowedNewSubif) {
      errors.push({
        severity: "error",
        code: "interface_not_found",
        message: `Interface ${interfaceToCheck} não existe no device.`,
        context: { interface: interfaceToCheck, available: input.device.interfaceNames.slice(0, 24) },
      });
    }
  }
  const interfaceState = input.device.interfaceStates.find((item) => {
    const target = interfaceToCheck?.toLowerCase();
    if (!target) return false;
    return item.name.toLowerCase() === target || item.name.toLowerCase() === target.split(".")[0];
  });
  if (interfaceState && (interfaceState.adminStatus === "down" || interfaceState.operStatus === "down")) {
    warnings.push({
      severity: "warning",
      code: "interface_down",
      message: `Interface ${interfaceToCheck} está down no inventário.`,
      context: { interface: interfaceToCheck, adminStatus: interfaceState.adminStatus, operStatus: interfaceState.operStatus },
    });
  }

  const normalizedCircuitId = normalizeCircuitName(normalized.circuitId);
  if (!normalizedCircuitId) {
    errors.push({ severity: "error", code: "invalid_circuit_name", message: "Nome do circuito inválido após normalização.", context: { circuitId: normalized.circuitId } });
  }
  if (normalizedCircuitId !== normalized.circuitId) {
    warnings.push({
      severity: "warning",
      code: "circuit_name_normalized",
      message: `Nome do circuito normalizado para ${normalizedCircuitId}.`,
      context: { original: normalized.circuitId, normalized: normalizedCircuitId },
    });
  }

  const prefixes = [...toArray(normalized.ipv4Prefixes), ...toArray(normalized.ipv6Prefixes)];
  for (const prefix of prefixes) {
    if (!isValidPrefix(prefix)) {
      errors.push({ severity: "error", code: "invalid_prefix", message: `Prefixo inválido: ${prefix}.`, context: { prefix } });
      continue;
    }
    if (prefixIsBogon(prefix)) {
      const finding = {
        severity: input.templateKey === "huawei_vrp_l2vpn_vlan" ? "error" : "warning",
        code: "bogon_prefix",
        message: `Prefixo bogon/RFC1918 detectado: ${prefix}.`,
        context: { prefix },
      } satisfies ConfigGeneratorValidationFinding;
      if (finding.severity === "error") errors.push(finding); else warnings.push(finding);
    }
  }

  if (input.templateKey === "huawei_vrp_l2vpn_vlan" && input.existingVlans?.includes(vlan ?? 0)) {
    errors.push({
      severity: "error",
      code: "vlan_conflict",
      message: `VLAN já usada no device: ${vlan}.`,
      context: { vlan },
    });
  }

  if (isPtpL2vc || isPtmpVsi) {
    const subifId = parseInteger(normalized.subinterfaceId) ?? vlan;
    const subifName = resolveSubinterfaceName(
      normalizeString(normalized.localInterface) || normalizeString(normalized.interface).split(".")[0] || "",
      vlan ?? 0,
      normalizeString(normalized.interface) || normalizeString(normalized.accessInterface),
    );
    if (input.existingVlans?.includes(vlan ?? 0)) {
      errors.push({
        severity: "error",
        code: "vlan_conflict",
        message: `VLAN ${vlan} já usada no device/site.`,
        context: { vlan, serviceType: input.serviceType },
      });
    }
    if (subifName && (input.existingSubinterfaces ?? []).some((item) => item.toLowerCase() === subifName.toLowerCase())) {
      errors.push({
        severity: "error",
        code: "subinterface_conflict",
        message: `Subinterface ${subifName} já existe no device.`,
        context: { subinterface: subifName, subinterfaceId: subifId },
      });
    }
    const l2vcId = parseInteger(normalized.l2vcId);
    if (l2vcId != null && (input.existingL2vcIds ?? []).includes(l2vcId)) {
      errors.push({
        severity: "error",
        code: "l2vc_conflict",
        message: `L2VC ID ${l2vcId} já ocupado no tenant.`,
        context: { l2vcId },
      });
    }
    const vsiId = parseInteger(normalized.vsiId);
    if (vsiId != null && (input.existingVsiIds ?? []).includes(vsiId)) {
      errors.push({
        severity: "error",
        code: "vsi_conflict",
        message: `VSI ID ${vsiId} já ocupado no tenant.`,
        context: { vsiId },
      });
    }
    const baselineMtu = extractMtuFromConfig(input.device.latestConfig, subifName);
    const requestedMtu = parseInteger(normalized.mtu);
    if (baselineMtu != null && requestedMtu != null && baselineMtu !== requestedMtu) {
      warnings.push({
        severity: "warning",
        code: "mtu_divergent",
        message: `MTU ${requestedMtu} diverge do baseline ${baselineMtu} em ${subifName}.`,
        context: { requestedMtu, baselineMtu, interface: subifName },
      });
    }
  }

  if (isPtpL2vc) {
    const remotePeerIp = normalizeString(normalized.remotePeerIp);
    if (!remotePeerIp) {
      errors.push({ severity: "error", code: "missing_remote_peer", message: "Remote peer IP ausente para L2VC.", context: { field: "remotePeerIp" } });
    } else if (!isValidIpv4(remotePeerIp)) {
      errors.push({ severity: "error", code: "invalid_remote_peer", message: "Remote peer IP inválido.", context: { remotePeerIp } });
    }
    const remotePeers = parseRemotePeersList(normalized.remotePeers);
    if (remotePeers.length > 1) {
      warnings.push({
        severity: "warning",
        code: "ptp_multiple_peers",
        message: "Múltiplos peers detectados — considere template L2VPN PTMP/VSI.",
        context: { peerCount: remotePeers.length },
      });
    }
  }

  if (isPtmpVsi) {
    const remotePeers = parseRemotePeersList(normalized.remotePeers);
    if (remotePeers.length === 0) {
      errors.push({ severity: "error", code: "missing_remote_peers", message: "VSI requer ao menos um remote peer.", context: { field: "remotePeers" } });
    }
    if (remotePeers.length === 1) {
      warnings.push({
        severity: "warning",
        code: "ptmp_single_peer",
        message: "Apenas um peer — considere template L2VPN PTP/L2VC.",
        context: { peerCount: 1 },
      });
    }
    for (const peer of remotePeers) {
      if (!isValidIpv4(peer)) {
        errors.push({ severity: "error", code: "invalid_remote_peer", message: `Remote peer inválido: ${peer}.`, context: { peer } });
      }
    }
  }

  const candidateCommunity = buildCandidateCommunity(localAsn ?? 0, normalizedCircuitId, vlan ?? 0);
  if (candidateCommunity && (input.existingCommunities ?? []).includes(candidateCommunity)) {
    errors.push({
      severity: "error",
      code: "community_conflict",
      message: `Community derivada já existe no device: ${candidateCommunity}.`,
      context: { community: candidateCommunity },
    });
  }

  const communityBase = normalizeString(normalized.communityBase) || candidateCommunity;
  if (communityBase && (input.existingCommunities ?? []).some((value) => value === communityBase || value.includes(communityBase))) {
    errors.push({
      severity: "error",
      code: "community_base_conflict",
      message: `Community base já existe no device: ${communityBase}.`,
      context: { communityBase },
    });
  }

  const peerRemoteIpv4 = normalizeString(normalized.peerRemoteIpv4);
  if (input.templateKey === "huawei_vrp_bgp_customer_community" && peerRemoteIpv4 && (input.existingPeerRemoteIps ?? []).includes(peerRemoteIpv4)) {
    warnings.push({
      severity: "warning",
      code: "peer_remote_ip_exists",
      message: `Peer remote IPv4 já existe no device: ${peerRemoteIpv4}.`,
      context: { peerRemoteIpv4 },
    });
  }

  const globalStatus = collectGlobalStatus(input.device.latestConfig);
  for (const entry of globalStatus) {
    if (!entry.present) {
      warnings.push({
        severity: "warning",
        code: "global_dependency_missing",
        message: `Dependência global ausente: ${entry.name}.`,
        context: { dependency: entry.name },
      });
    }
  }

  const existingRoutePolicies = input.existingRoutePolicies ?? [];
  for (const policyName of routePolicies) {
    if (existingRoutePolicies.some((value) => value.toLowerCase() === policyName.toLowerCase())) {
      errors.push({
        severity: "error",
        code: "route_policy_conflict",
        message: `Route-policy já conflitante com outro circuito: ${policyName}.`,
        context: { policy: policyName },
      });
    }
  }

  for (const prefix of [...toArray(normalized.ipv4Prefixes), ...toArray(normalized.ipv6Prefixes)]) {
    if ((input.device.latestConfig ?? "").includes(prefix)) {
      errors.push({
        severity: "error",
        code: "prefix_conflict",
        message: `Prefixo já existe no device: ${prefix}.`,
        context: { prefix },
      });
    }
  }

  for (const circuitId of input.existingCircuitIds ?? []) {
    if (normalizeCircuitName(circuitId) === normalizedCircuitId) {
      errors.push({
        severity: "error",
        code: "circuit_conflict",
        message: `Circuit ID já existe: ${normalizedCircuitId}.`,
        context: { circuitId: normalizedCircuitId },
      });
      break;
    }
  }

  if (input.templateKey === "huawei_vrp_l2vpn_vlan" && prefixes.length > 0) {
    warnings.push({
      severity: "warning",
      code: "l2_prefixes_present",
      message: "Prefixos informados para L2VPN serão tratados como dependências de documentação, não de enfileiramento de roteamento.",
      context: { prefixCount: prefixes.length },
    });
  }

  if (input.templateKey === "huawei_vrp_bgp_customer_community" && toArray(normalized.ipv4Prefixes).length === 0 && toArray(normalized.ipv6Prefixes).length === 0) {
    warnings.push({
      severity: "warning",
      code: "empty_prefixes",
      message: "BGP cliente sem prefixos informados.",
    });
  }

  if (input.templateKey === "huawei_vrp_bgp_customer_community" && !normalized.communityBase) {
    warnings.push({
      severity: "warning",
      code: "global_dependency_missing",
      message: "Community base ausente. Baseline global pode ser necessária.",
      context: { dependency: "community-base" },
    });
  }

  if (normalized.md5) {
    warnings.push({
      severity: "warning",
      code: "SECRET_NOT_PERSISTED",
      message: "MD5 informado será mascarado em logs e persistência.",
    });
  }

  const status = errors.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed";
  return { status, warnings, errors };
}

export function renderConfigGeneratorBlocks(input: {
  templateKey: string;
  templateContent: string;
  schemaJson: ConfigGeneratorTemplateSchemaJson;
  normalizedInput: NormalizedInput;
  device: ConfigGeneratorDeviceScope;
}): ConfigGeneratorBlockOutput {
  const { templateKey, templateContent, normalizedInput, device } = input;
  const result = templateKey === L2VPN_PTP_TEMPLATE_KEY
    ? buildL2vcPtpBlocks(normalizedInput, device)
    : templateKey === L2VPN_PTMP_TEMPLATE_KEY
      ? buildVsiPtmpBlocks(normalizedInput, device)
      : templateKey === "huawei_vrp_l2vpn_vlan"
        ? buildL2Blocks(normalizedInput, device)
        : buildBgpBlocks(normalizedInput, device);

  const renderValues = sanitizeConfigGeneratorInputForStorage(normalizedInput);
  const renderedConfig = renderTemplateString(templateContent, {
    ...renderValues,
    ...Object.fromEntries(result.blocks.map((block) => [block.key, block.content])),
    tenantName: device.tenantName ?? "",
    hostname: device.hostname,
    vendor: device.vendor,
    platform: device.platform,
  });

  return {
    ...result,
    renderedConfig: sanitizeRenderedConfig(renderedConfig),
  };
}

export function buildValidationSummary(findings: ConfigGeneratorValidationFinding[]): ConfigGeneratorValidationSummary {
  const warnings = findings.filter((item) => item.severity === "warning");
  const errors = findings.filter((item) => item.severity === "error");
  return {
    status: errors.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
    warnings,
    errors,
  };
}

export function mergeValidationSummaries(...summaries: ConfigGeneratorValidationSummary[]): ConfigGeneratorValidationSummary {
  const warnings = summaries.flatMap((item) => item.warnings);
  const errors = summaries.flatMap((item) => item.errors);
  return buildValidationSummary([...warnings, ...errors]);
}

export function getArtifactTypeLabel(type: ConfigGeneratorArtifactType): string {
  return type.replace(/_/g, " ");
}
