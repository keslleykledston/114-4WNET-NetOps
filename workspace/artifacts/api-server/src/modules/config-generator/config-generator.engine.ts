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
import { CONFIG_GENERATOR_GLOBAL_OBJECTS } from "./config-generator.catalog.js";
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
}): ConfigGeneratorValidationSummary {
  const warnings: ConfigGeneratorValidationFinding[] = [];
  const errors: ConfigGeneratorValidationFinding[] = [];
  const normalized = input.normalizedInput;

  const requiredKeys = ["circuitId", "customerName", "interface", "vlan"];
  if (input.templateKey === "huawei_vrp_bgp_customer_community") {
    requiredKeys.push("localAsn", "remoteAsn", "peerLocalIpv4", "peerRemoteIpv4", "ipv4Prefixes");
  }
  for (const key of requiredKeys) {
    if (normalized[key] == null || normalized[key] === "" || (Array.isArray(normalized[key]) && (normalized[key] as unknown[]).length === 0)) {
      errors.push({ severity: "error", code: "missing_required_field", message: `Campo obrigatório ausente: ${key}.`, context: { field: key } });
    }
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

  if (normalized.interface && !input.device.interfaceNames.some((name) => name.toLowerCase() === String(normalized.interface).toLowerCase())) {
    errors.push({
      severity: "error",
      code: "interface_not_found",
      message: `Interface ${normalized.interface} não existe no device.`,
      context: { interface: normalized.interface, available: input.device.interfaceNames.slice(0, 24) },
    });
  }
  const interfaceState = input.device.interfaceStates.find((item) => item.name.toLowerCase() === String(normalized.interface).toLowerCase());
  if (interfaceState && (interfaceState.adminStatus === "down" || interfaceState.operStatus === "down")) {
    warnings.push({
      severity: "warning",
      code: "interface_down",
      message: `Interface ${normalized.interface} está down no inventário.`,
      context: { interface: normalized.interface, adminStatus: interfaceState.adminStatus, operStatus: interfaceState.operStatus },
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
  const result = templateKey === "huawei_vrp_l2vpn_vlan"
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
