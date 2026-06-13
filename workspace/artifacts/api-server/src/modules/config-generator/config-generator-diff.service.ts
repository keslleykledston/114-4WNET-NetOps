import { desc, eq } from "drizzle-orm";
import {
  bgpAnnouncementMatrixSnapshotsTable,
  bgpAnnouncementTargetsTable,
  bgpCommunitySetsTable,
  collectedConfigsTable,
  configGeneratorArtifactsTable,
  configGeneratorTemplateVersionsTable,
  configGeneratorTemplatesTable,
  db,
  discoverySnapshotsTable,
  l2CircuitsTable,
  snmpSnapshotsTable,
} from "@workspace/db";
import type {
  ConfigGeneratorBlockOutput,
  ConfigGeneratorDiffBaseline,
  ConfigGeneratorDiffBlock,
  ConfigGeneratorDiffLine,
  ConfigGeneratorDiffLineStatus,
  ConfigGeneratorDiffResponse,
  ConfigGeneratorDiffSummary,
  ConfigGeneratorValidationInput,
} from "./config-generator.types.js";
import { checksumJson, sanitizeRenderedConfig } from "./config-generator.engine.js";
import { previewConfigGenerator, getConfigGeneratorRun } from "./config-generator.service.js";

type BaselineText = {
  lines: string[];
  rawConfig: string | null;
  collectedAt: string | null;
  source: ConfigGeneratorDiffBaseline["source"];
  checksum: string | null;
  semantic: BaselineSemantic;
};

export type ConfigGeneratorDiffBaselineState = BaselineText;

type BaselineSemantic = {
  routePolicies: Map<string, string>;
  prefixLists: Map<string, string>;
  communityFilters: Map<string, string>;
  asPathFilters: Set<string>;
  interfaces: Map<string, string>;
  vlans: Map<number, string>;
  peers: Map<string, { asn: number | null; importPolicy: string | null; exportPolicy: string | null }>;
  bgpLocalAsn: number | null;
};

const BGP_BLOCK_KEYS = new Set(["global_dependencies", "circuit_dependencies", "route_policy_import", "route_policy_export", "peer_binding", "postcheck", "rollback_placeholder"]);

function sha(text: string) {
  return checksumJson({ text });
}

function normalizeLine(line: string) {
  return line.trim().replace(/\s+/g, " ");
}

function parseJsonArray<T = unknown>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function semanticBaselineFromRaw(rawConfig: string | null): BaselineSemantic {
  const routePolicies = new Map<string, string>();
  const prefixLists = new Map<string, string>();
  const communityFilters = new Map<string, string>();
  const asPathFilters = new Set<string>();
  const interfaces = new Map<string, string>();
  const vlans = new Map<number, string>();
  const peers = new Map<string, { asn: number | null; importPolicy: string | null; exportPolicy: string | null }>();
  let bgpLocalAsn: number | null = null;

  for (const line of (rawConfig ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    const routePolicy = /^route-policy\s+(\S+)/i.exec(trimmed);
    if (routePolicy?.[1]) routePolicies.set(routePolicy[1].toLowerCase(), routePolicy[1]);
    const prefixList = /^ip\s+ip-prefix\s+(\S+)/i.exec(trimmed) || /^ip-prefix\s+(\S+)/i.exec(trimmed);
    if (prefixList?.[1]) prefixLists.set(prefixList[1].toLowerCase(), prefixList[1]);
    const communityFilter = /^ip\s+community-filter\s+(\S+)/i.exec(trimmed) || /^community-filter\s+(\S+)/i.exec(trimmed);
    if (communityFilter?.[1]) communityFilters.set(communityFilter[1].toLowerCase(), communityFilter[1]);
    const asPathFilter = /^ip\s+as-path-filter\s+(\S+)/i.exec(trimmed) || /^as-path-filter\s+(\S+)/i.exec(trimmed);
    if (asPathFilter?.[1]) asPathFilters.add(asPathFilter[1].toLowerCase());
    const interfaceMatch = /^(?:interface|int)\s+(.+)$/i.exec(trimmed);
    if (interfaceMatch?.[1]) interfaces.set(interfaceMatch[1].toLowerCase(), interfaceMatch[1]);
    const vlanMatch = /^vlan\s+(\d+)/i.exec(trimmed);
    if (vlanMatch?.[1]) vlans.set(Number(vlanMatch[1]), vlanMatch[1]);
    const bgpMatch = /^bgp\s+(\d+)/i.exec(trimmed);
    if (bgpMatch?.[1]) bgpLocalAsn = Number(bgpMatch[1]);
    const peerMatch = /^peer\s+(\S+)\s+as-number\s+(\d+)/i.exec(trimmed);
    if (peerMatch?.[1]) peers.set(peerMatch[1], { asn: Number(peerMatch[2]), importPolicy: null, exportPolicy: null });
    const peerImport = /^peer\s+(\S+)\s+route-policy\s+(\S+)\s+import/i.exec(trimmed);
    if (peerImport?.[1]) {
      const current = peers.get(peerImport[1]) ?? { asn: null, importPolicy: null, exportPolicy: null };
      current.importPolicy = peerImport[2];
      peers.set(peerImport[1], current);
    }
    const peerExport = /^peer\s+(\S+)\s+route-policy\s+(\S+)\s+export/i.exec(trimmed);
    if (peerExport?.[1]) {
      const current = peers.get(peerExport[1]) ?? { asn: null, importPolicy: null, exportPolicy: null };
      current.exportPolicy = peerExport[2];
      peers.set(peerExport[1], current);
    }
  }

  return { routePolicies, prefixLists, communityFilters, asPathFilters, interfaces, vlans, peers, bgpLocalAsn };
}

async function loadLatestBaseline(deviceId: number): Promise<BaselineText> {
  const [collected] = await db
    .select({ rawConfig: collectedConfigsTable.rawConfig, collectedAt: collectedConfigsTable.collectedAt })
    .from(collectedConfigsTable)
    .where(eq(collectedConfigsTable.deviceId, deviceId))
    .orderBy(desc(collectedConfigsTable.collectedAt))
    .limit(1);
  if (collected?.rawConfig) {
    const semantic = semanticBaselineFromRaw(collected.rawConfig);
    const [announcementRows] = await Promise.all([
      db.select({ routePolicyName: bgpAnnouncementTargetsTable.routePolicyName }).from(bgpAnnouncementTargetsTable).where(eq(bgpAnnouncementTargetsTable.deviceId, deviceId)).limit(200),
    ]);
    for (const row of announcementRows) {
      if (row.routePolicyName) semantic.routePolicies.set(row.routePolicyName.toLowerCase(), row.routePolicyName);
    }
    const [communitySetRows] = await Promise.all([
      db.select({ name: bgpCommunitySetsTable.name }).from(bgpCommunitySetsTable).where(eq(bgpCommunitySetsTable.deviceId, deviceId)).limit(200),
    ]);
    for (const row of communitySetRows) {
      if (row.name) semantic.communityFilters.set(row.name.toLowerCase(), row.name);
    }
    const [matrixRows] = await Promise.all([
      db.select().from(bgpAnnouncementMatrixSnapshotsTable).where(eq(bgpAnnouncementMatrixSnapshotsTable.deviceId, deviceId)).orderBy(desc(bgpAnnouncementMatrixSnapshotsTable.createdAt)).limit(1),
    ]);
    const matrixRow = matrixRows[0];
    if (matrixRow?.rowsJson && typeof matrixRow.rowsJson === "object") {
      const rows = matrixRow.rowsJson as Array<{ routePolicyName?: string; peerIp?: string; vlan?: number }>;
      for (const row of rows) {
        if (row.routePolicyName) semantic.routePolicies.set(row.routePolicyName.toLowerCase(), row.routePolicyName);
        if (row.peerIp) semantic.peers.set(row.peerIp, { asn: null, importPolicy: null, exportPolicy: null });
        if (typeof row.vlan === "number") semantic.vlans.set(row.vlan, String(row.vlan));
      }
    }
    const [l2Rows] = await Promise.all([
      db.select({ outerVlan: l2CircuitsTable.outerVlan, innerVlan: l2CircuitsTable.innerVlan }).from(l2CircuitsTable).where(eq(l2CircuitsTable.deviceId, deviceId)).limit(200),
    ]);
    for (const row of l2Rows) {
      if (typeof row.outerVlan === "number") semantic.vlans.set(row.outerVlan, String(row.outerVlan));
      if (typeof row.innerVlan === "number") semantic.vlans.set(row.innerVlan, String(row.innerVlan));
    }
    return {
      source: "collected_configs",
      rawConfig: collected.rawConfig,
      collectedAt: collected.collectedAt.toISOString(),
      lines: collected.rawConfig.split(/\r?\n/).map(normalizeLine).filter(Boolean),
      checksum: sha(collected.rawConfig),
      semantic,
    };
  }

  const [discovery] = await db
    .select({ snapshotJson: discoverySnapshotsTable.snapshotJson, createdAt: discoverySnapshotsTable.createdAt })
    .from(discoverySnapshotsTable)
    .where(eq(discoverySnapshotsTable.deviceId, deviceId))
    .orderBy(desc(discoverySnapshotsTable.createdAt))
    .limit(1);
  if (discovery?.snapshotJson) {
    const snapshot = discovery.snapshotJson as Record<string, unknown>;
    const policyNames = new Set<string>();
    for (const policy of (snapshot.policies as Array<{ name?: string }> | undefined) ?? []) {
      if (policy.name) policyNames.add(policy.name.toLowerCase());
    }
    for (const prefix of [
      ...((snapshot.prefixLists as Array<{ name?: string }> | undefined) ?? []),
      ...((snapshot.ipv6PrefixLists as Array<{ name?: string }> | undefined) ?? []),
    ]) {
      if (prefix.name) policyNames.add(prefix.name.toLowerCase());
    }
    const semantic: BaselineSemantic = {
      routePolicies: policyNames.size > 0 ? new Map([...policyNames].map((name) => [name, name])) : new Map(),
      prefixLists: new Map(),
      communityFilters: new Map(),
      asPathFilters: new Set(),
      interfaces: new Map(),
      vlans: new Map(),
      peers: new Map(),
      bgpLocalAsn: null,
    };
    for (const item of ((snapshot.communities as Array<{ name?: string }> | undefined) ?? [])) if (item.name) semantic.communityFilters.set(item.name.toLowerCase(), item.name);
    for (const item of ((snapshot.communityLists as Array<{ name?: string }> | undefined) ?? [])) if (item.name) semantic.communityFilters.set(item.name.toLowerCase(), item.name);
    for (const item of ((snapshot.prefixLists as Array<{ name?: string }> | undefined) ?? [])) if (item.name) semantic.prefixLists.set(item.name.toLowerCase(), item.name);
    for (const item of ((snapshot.asPathFilters as Array<{ name?: string }> | undefined) ?? [])) if (item.name) semantic.asPathFilters.add(item.name.toLowerCase());
    for (const item of ((snapshot.interfaces as Array<{ name?: string }> | undefined) ?? [])) if (item.name) semantic.interfaces.set(item.name.toLowerCase(), item.name);
    const [targetRows] = await Promise.all([
      db.select({ routePolicyName: bgpAnnouncementTargetsTable.routePolicyName }).from(bgpAnnouncementTargetsTable).where(eq(bgpAnnouncementTargetsTable.deviceId, deviceId)).limit(200),
    ]);
    for (const row of targetRows) if (row.routePolicyName) semantic.routePolicies.set(row.routePolicyName.toLowerCase(), row.routePolicyName);
    return {
      source: "discovery_snapshots",
      rawConfig: null,
      collectedAt: discovery.createdAt.toISOString(),
      lines: [],
      checksum: sha(JSON.stringify(snapshot)),
      semantic,
    };
  }

  const [snmp] = await db
    .select()
    .from(snmpSnapshotsTable)
    .where(eq(snmpSnapshotsTable.deviceId, deviceId))
    .orderBy(desc(snmpSnapshotsTable.collectedAt))
    .limit(1);
  if (snmp) {
    const interfaces = parseJsonArray<{ name?: string }>(snmp.interfacesJson);
    const peers = parseJsonArray<{ peerIp?: string }>(snmp.bgpPeersJson);
    const semantic: BaselineSemantic = {
      routePolicies: new Map(),
      prefixLists: new Map(),
      communityFilters: new Map(),
      asPathFilters: new Set(),
      interfaces: new Map(interfaces.filter((item) => item?.name).map((item) => [String(item.name).toLowerCase(), String(item.name)])),
      vlans: new Map(),
      peers: new Map(peers.filter((item) => item?.peerIp).map((item) => [String(item.peerIp), { asn: null, importPolicy: null, exportPolicy: null }])),
      bgpLocalAsn: null,
    };
    return {
      source: "snmp_snapshots",
      rawConfig: null,
      collectedAt: snmp.collectedAt.toISOString(),
      lines: [],
      checksum: sha(JSON.stringify(snmp)),
      semantic,
    };
  }

  const [policyTargets, communitySets, matrixSnapshot, l2Rows] = await Promise.all([
    db.select({ routePolicyName: bgpAnnouncementTargetsTable.routePolicyName }).from(bgpAnnouncementTargetsTable).where(eq(bgpAnnouncementTargetsTable.deviceId, deviceId)).limit(200),
    db.select({ name: bgpCommunitySetsTable.name }).from(bgpCommunitySetsTable).where(eq(bgpCommunitySetsTable.deviceId, deviceId)).limit(200),
    db.select().from(bgpAnnouncementMatrixSnapshotsTable).where(eq(bgpAnnouncementMatrixSnapshotsTable.deviceId, deviceId)).orderBy(desc(bgpAnnouncementMatrixSnapshotsTable.createdAt)).limit(1),
    db.select({ outerVlan: l2CircuitsTable.outerVlan, innerVlan: l2CircuitsTable.innerVlan }).from(l2CircuitsTable).where(eq(l2CircuitsTable.deviceId, deviceId)).limit(200),
  ]);
  const semantic: BaselineSemantic = {
    routePolicies: new Map(),
    prefixLists: new Map(),
    communityFilters: new Map(),
    asPathFilters: new Set(),
    interfaces: new Map(),
    vlans: new Map(),
    peers: new Map(),
    bgpLocalAsn: null,
  };
  for (const row of policyTargets) {
    if (row.routePolicyName) semantic.routePolicies.set(row.routePolicyName.toLowerCase(), row.routePolicyName);
  }
  for (const row of communitySets) {
    if (row.name) semantic.communityFilters.set(row.name.toLowerCase(), row.name);
  }
  const matrixRow = matrixSnapshot[0];
  if (matrixRow?.rowsJson && typeof matrixRow.rowsJson === "object") {
    const rows = matrixRow.rowsJson as Array<{ routePolicyName?: string; peerIp?: string; vlan?: number }>;
    for (const row of rows) {
      if (row.routePolicyName) semantic.routePolicies.set(row.routePolicyName.toLowerCase(), row.routePolicyName);
      if (row.peerIp) semantic.peers.set(row.peerIp, { asn: null, importPolicy: null, exportPolicy: null });
      if (typeof row.vlan === "number") semantic.vlans.set(row.vlan, String(row.vlan));
    }
  }
  for (const row of l2Rows) {
    if (typeof row.outerVlan === "number") semantic.vlans.set(row.outerVlan, String(row.outerVlan));
    if (typeof row.innerVlan === "number") semantic.vlans.set(row.innerVlan, String(row.innerVlan));
  }
  if (
    semantic.routePolicies.size > 0
    || semantic.prefixLists.size > 0
    || semantic.communityFilters.size > 0
    || semantic.asPathFilters.size > 0
    || semantic.interfaces.size > 0
    || semantic.vlans.size > 0
    || semantic.peers.size > 0
    || semantic.bgpLocalAsn != null
  ) {
    return {
      source: "policy_catalog",
      rawConfig: null,
      collectedAt: matrixRow?.createdAt?.toISOString?.() ?? null,
      lines: [],
      checksum: sha(JSON.stringify({
        policyTargets,
        communitySets,
        matrixRow,
        l2Rows,
      })),
      semantic,
    };
  }

  return {
    source: "none",
    rawConfig: null,
    collectedAt: null,
    lines: [],
    checksum: null,
    semantic: {
      routePolicies: new Map(),
      prefixLists: new Map(),
      communityFilters: new Map(),
      asPathFilters: new Set(),
      interfaces: new Map(),
      vlans: new Map(),
      peers: new Map(),
      bgpLocalAsn: null,
    },
  };
}

function classifyGlobalLine(line: string, baseline: BaselineText): ConfigGeneratorDiffLineStatus {
  const normalized = normalizeLine(line).toLowerCase();
  const name = normalized.replace(/^\[global\s*\/[^\]]+\]\s*/i, "");
  const clean = name.replace(/^(?:ip\s+)?(?:ip-prefix|community-filter|as-path-filter|route-policy)\s+/i, "").trim();
  if (!name) return "unknown_no_baseline";
  if (baseline.source === "none") return "unknown_no_baseline";
  if (normalized.includes("ausente") || normalized.includes("missing")) return "global_missing";
  if (baseline.lines.some((baselineLine) => baselineLine.toLowerCase().includes(clean.toLowerCase()))) return "global_existing";
  if (baseline.semantic.routePolicies.has(clean.toLowerCase()) || baseline.semantic.prefixLists.has(clean.toLowerCase()) || baseline.semantic.communityFilters.has(clean.toLowerCase()) || baseline.semantic.asPathFilters.has(clean.toLowerCase())) {
    return "global_existing";
  }
  return "global_missing";
}

function classifySemanticLine(line: string, baseline: BaselineText): { status: ConfigGeneratorDiffLineStatus; details?: string } {
  const normalized = normalizeLine(line);
  const lower = normalized.toLowerCase();
  if (!baseline.lines.length && baseline.source === "none") return { status: "unknown_no_baseline" };
  if (baseline.lines.some((baselineLine) => baselineLine === normalized)) return { status: "already_present" };
  if (lower.includes("community-filter") && baseline.semantic.communityFilters.size > 0) {
    const match = /community-filter\s+(\S+)/i.exec(normalized)?.[1];
    if (match && baseline.semantic.communityFilters.has(match.toLowerCase())) return { status: "partial_match", details: "community-filter exists" };
  }
  if (lower.includes("route-policy")) {
    const match = /route-policy\s+(\S+)/i.exec(normalized)?.[1];
    if (match && baseline.semantic.routePolicies.has(match.toLowerCase())) return { status: "partial_match", details: "route-policy exists" };
  }
  if (lower.includes("interface ")) {
    const match = /interface\s+(.+)$/i.exec(normalized)?.[1];
    if (match && baseline.semantic.interfaces.has(match.toLowerCase())) return { status: "partial_match", details: "interface exists" };
  }
  if (lower.includes("vlan ")) {
    const match = /vlan\s+(\d+)/i.exec(normalized)?.[1];
    if (match && baseline.semantic.vlans.has(Number(match))) return { status: "partial_match", details: "vlan exists" };
  }
  if (lower.includes("peer ")) {
    const match = /peer\s+(\S+)\s+as-number\s+(\d+)/i.exec(normalized);
    if (match) {
      const current = baseline.semantic.peers.get(match[1]);
      if (current?.asn === Number(match[2])) return { status: "already_present" };
      if (current?.asn != null && current.asn !== Number(match[2])) return { status: "conflict", details: "peer ASN differs" };
      if (baseline.semantic.peers.has(match[1])) return { status: "manual_review", details: "peer exists in other context" };
    }
  }
  if (lower.includes("ip-prefix") || lower.includes("prefix-list")) {
    const match = /(ip-prefix|prefix-list)\s+(\S+)/i.exec(normalized)?.[2];
    if (match && baseline.semantic.prefixLists.has(match.toLowerCase())) return { status: "already_present", details: "prefix list exists" };
  }
  return { status: "new_candidate" };
}

function summarizeStatus(status: ConfigGeneratorDiffLineStatus, summary: ConfigGeneratorDiffSummary) {
  switch (status) {
    case "already_present":
    case "global_existing":
      summary.alreadyPresent += 1;
      summary.globalExisting += 1;
      break;
    case "new_candidate":
      summary.newCandidate += 1;
      break;
    case "partial_match":
      summary.manualReview += 1;
      break;
    case "conflict":
      summary.conflicts += 1;
      break;
    case "missing_dependency":
      summary.missingDependencies += 1;
      break;
    case "global_missing":
      summary.globalMissing += 1;
      summary.manualReview += 1;
      break;
    case "manual_review":
      summary.manualReview += 1;
      break;
    case "unknown_no_baseline":
      summary.unknown += 1;
      break;
  }
}

function initialSummary(): ConfigGeneratorDiffSummary {
  return {
    alreadyPresent: 0,
    newCandidate: 0,
    conflicts: 0,
    manualReview: 0,
    unknown: 0,
    missingDependencies: 0,
    globalExisting: 0,
    globalMissing: 0,
  };
}

function buildBlockDiff(block: ConfigGeneratorBlockOutput["blocks"][number], baseline: BaselineText): ConfigGeneratorDiffBlock {
  const items: ConfigGeneratorDiffLine[] = [];
  for (const line of block.content.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    let status: ConfigGeneratorDiffLineStatus = "new_candidate";
    let details: string | undefined;
    if (block.key === "global_dependencies") {
      status = classifyGlobalLine(line, baseline);
    } else {
      ({ status, details } = classifySemanticLine(line, baseline));
    }
    items.push({ line, status, ...(details ? { details } : {}) });
  }
  const status = items.some((item) => item.status === "conflict") ? "conflict"
    : items.some((item) => item.status === "partial_match" || item.status === "manual_review") ? "partial_match"
    : items.some((item) => item.status === "global_missing" || item.status === "missing_dependency") ? "missing_dependency"
    : items.every((item) => item.status === "already_present" || item.status === "global_existing") ? "already_present"
    : items.some((item) => item.status === "unknown_no_baseline") ? "unknown_no_baseline"
    : "new_candidate";
  return { key: block.key, title: block.title, classification: block.classification, status, items };
}

function blocksToDiff(blocks: ConfigGeneratorBlockOutput["blocks"], baseline: BaselineText) {
  const summary = initialSummary();
  const diffBlocks = blocks.filter((block) => BGP_BLOCK_KEYS.has(block.key) || block.key === "global_dependencies" || block.key === "circuit_dependencies").map((block) => buildBlockDiff(block, baseline));
  for (const block of diffBlocks) for (const item of block.items) summarizeStatus(item.status, summary);
  const warnings: ConfigGeneratorDiffLine[] = [];
  if (baseline.source === "none") {
    warnings.push({ line: "No baseline available", status: "unknown_no_baseline", details: "Não há configuração coletada recente para este device." });
    summary.unknown += 1;
  }
  const blocking = diffBlocks.some((block) => block.status === "conflict");
  return { diffBlocks, summary, warnings, blocking };
}

export function buildConfigGeneratorDiffFromPreview(preview: ConfigGeneratorBlockOutput, baseline: ConfigGeneratorDiffBaselineState) {
  return blocksToDiff(preview.blocks, baseline);
}

export function prepareConfigGeneratorDiffArtifacts(diff: ConfigGeneratorDiffResponse, existingTypes: Iterable<string>) {
  const existing = new Set(existingTypes);
  const payload = JSON.stringify(diff);
  const inserts = [] as Array<{ artifactType: string; content: string; checksum: string }>;
  if (!existing.has("precheck_diff")) {
    inserts.push({
      artifactType: "precheck_diff",
      content: payload,
      checksum: checksumJson({ artifactType: "precheck_diff", payload, candidateChecksum: diff.candidateChecksum, baselineChecksum: diff.baselineChecksum }),
    });
  }
  if (!existing.has("semantic_diff")) {
    inserts.push({
      artifactType: "semantic_diff",
      content: payload,
      checksum: checksumJson({ artifactType: "semantic_diff", payload, candidateChecksum: diff.candidateChecksum, baselineChecksum: diff.baselineChecksum }),
    });
  }
  return inserts;
}

async function loadRunAndTemplate(runId: number) {
  const run = await getConfigGeneratorRun(runId);
  if (!run) return null;
  const [version] = await db
    .select({ id: configGeneratorTemplateVersionsTable.id, templateId: configGeneratorTemplateVersionsTable.templateId, version: configGeneratorTemplateVersionsTable.version, content: configGeneratorTemplateVersionsTable.content, schemaJson: configGeneratorTemplateVersionsTable.schemaJson, renderer: configGeneratorTemplateVersionsTable.renderer, checksum: configGeneratorTemplateVersionsTable.checksum })
    .from(configGeneratorTemplateVersionsTable)
    .where(eq(configGeneratorTemplateVersionsTable.id, run.templateVersionId))
    .limit(1);
  if (!version) return null;
  const [template] = await db.select().from(configGeneratorTemplatesTable).where(eq(configGeneratorTemplatesTable.id, version.templateId)).limit(1);
  if (!template) return null;
  return { run, template, version };
}

async function diffFromPreview(input: ConfigGeneratorValidationInput) {
  const preview = await previewConfigGenerator(input);
  const baseline = await loadLatestBaseline(input.deviceId);
  const diff = buildConfigGeneratorDiffFromPreview(preview.blocks, baseline);
  return { preview, baseline, diff };
}

export async function previewConfigGeneratorDiff(input: ConfigGeneratorValidationInput): Promise<ConfigGeneratorDiffResponse> {
  const { preview, baseline, diff } = await diffFromPreview(input);
  const renderedConfig = sanitizeRenderedConfig(preview.blocks.renderedConfig);
  const baselineChecksum = baseline.checksum;
  const candidateChecksum = checksumJson({ renderedConfig, blocks: preview.blocks.blocks });
  const blocking = diff.blocking || preview.validation.errors.length > 0;
  return {
    status: "ok",
    baseline: {
      source: baseline.source,
      collectedAt: baseline.collectedAt,
      deviceId: input.deviceId,
      checksum: baseline.checksum,
    },
    summary: diff.summary,
    blocks: diff.diffBlocks,
    blocking,
    warnings: diff.warnings.map((item) => ({ severity: "warning", code: "NO_BASELINE", message: item.details ?? item.line })),
    errors: preview.validation.errors,
    renderedConfig,
    candidateChecksum,
    baselineChecksum,
  };
}

async function persistDiffArtifacts(runId: number, diff: ConfigGeneratorDiffResponse) {
  const existing = await db
    .select({ artifactType: configGeneratorArtifactsTable.artifactType })
    .from(configGeneratorArtifactsTable)
    .where(eq(configGeneratorArtifactsTable.runId, runId))
    .limit(100);
  const inserts = prepareConfigGeneratorDiffArtifacts(diff, existing.map((row) => row.artifactType)).map((artifact) => ({ runId, ...artifact }));
  if (inserts.length > 0) {
    await db.insert(configGeneratorArtifactsTable).values(inserts);
  }
}

export async function getConfigGeneratorPreviewDiff(input: ConfigGeneratorValidationInput): Promise<ConfigGeneratorDiffResponse> {
  return previewConfigGeneratorDiff(input);
}

export async function getConfigGeneratorRunDiff(runId: number): Promise<ConfigGeneratorDiffResponse | null> {
  const loaded = await loadRunAndTemplate(runId);
  if (!loaded) return null;
  const input: ConfigGeneratorValidationInput = {
    tenantId: loaded.run.tenantId,
    deviceId: loaded.run.deviceId,
    templateId: loaded.template.id,
    templateVersionId: loaded.version.id,
    input: loaded.run.inputJson as Record<string, unknown>,
    fieldOrigins: (loaded.run.fieldOrigins as ConfigGeneratorValidationInput["fieldOrigins"]) ?? {},
  };
  const diff = await previewConfigGeneratorDiff(input);
  await persistDiffArtifacts(runId, diff);
  return diff;
}
