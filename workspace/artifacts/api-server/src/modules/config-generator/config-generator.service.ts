import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  collectedConfigsTable,
  communityLibraryItemsTable,
  communitySetMembersTable,
  configGeneratorArtifactsTable,
  configGeneratorChangeRequestsTable,
  configGeneratorRunsTable,
  configGeneratorTemplateVersionsTable,
  configGeneratorTemplatesTable,
  configGeneratorValidationsTable,
  connectorsTable,
  connectorGroupsTable,
  db,
  devicesTable,
  l2CircuitsTable,
  tenantsTable,
  discoverySnapshotsTable,
  type ConfigGeneratorTemplate,
  type ConfigGeneratorTemplateVersion,
} from "@workspace/db";
import { env } from "../../lib/env.js";
import { logAuditEvent } from "../../lib/audit.js";
import type {
  ConfigGeneratorArtifactResponse,
  ConfigGeneratorBlockOutput,
  ConfigGeneratorDeviceScope,
  ConfigGeneratorErrorCode,
  ConfigGeneratorFieldOrigins,
  ConfigGeneratorRenderResponse,
  ConfigGeneratorRunDetail,
  ConfigGeneratorRunListItem,
  ConfigGeneratorRunResponse,
  ConfigGeneratorTemplateSchemaResponse,
  ConfigGeneratorTemplateSummary,
  ConfigGeneratorValidationInput,
  ConfigGeneratorValidationSummary,
} from "./config-generator.types.js";
import {
  checksumJson,
  mergeValidationSummaries,
  normalizeConfigGeneratorInput,
  renderConfigGeneratorBlocks,
  sanitizeConfigGeneratorInputForStorage,
  sanitizeConfigGeneratorValidationSummaryForStorage,
  validateConfigGeneratorInput,
  validateConfigGeneratorTemplateCompatibility,
  validateDeviceTenantScope,
} from "./config-generator.engine.js";
import { validateRequestedId, getUsedIds } from "./config-generator-id-allocator.service.js";
import { CONFIG_GENERATOR_REASONS, CONFIG_GENERATOR_TEMPLATES } from "./config-generator.catalog.js";

type DeviceScopeRow = ConfigGeneratorDeviceScope;

const seeded = { done: false };

export class ConfigGeneratorHttpError extends Error {
  code: ConfigGeneratorErrorCode;
  status: number;
  details?: Record<string, unknown>;

  constructor(code: ConfigGeneratorErrorCode, message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function configGeneratorError(code: ConfigGeneratorErrorCode, message: string, status: number, details?: Record<string, unknown>) {
  return new ConfigGeneratorHttpError(code, message, status, details);
}

function toTemplateSummary(template: ConfigGeneratorTemplate, latestVersion?: ConfigGeneratorTemplateVersion | null): ConfigGeneratorTemplateSummary {
  return {
    id: template.id,
    name: template.name,
    serviceType: template.serviceType,
    vendor: template.vendor,
    platform: template.platform,
    templateKey: template.templateKey,
    isActive: template.isActive,
    latestVersion: latestVersion?.version ?? null,
    latestVersionId: latestVersion?.id ?? null,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

async function loadLatestVersionsForTemplates(templateIds: number[]) {
  if (templateIds.length === 0) return new Map<number, ConfigGeneratorTemplateVersion>();
  const rows = await db
    .select()
    .from(configGeneratorTemplateVersionsTable)
    .where(inArray(configGeneratorTemplateVersionsTable.templateId, templateIds))
    .orderBy(desc(configGeneratorTemplateVersionsTable.createdAt));
  const latest = new Map<number, ConfigGeneratorTemplateVersion>();
  for (const row of rows) {
    if (!latest.has(row.templateId)) latest.set(row.templateId, row);
  }
  return latest;
}

export async function ensureConfigGeneratorSeeded() {
  if (!env.configGeneratorEnabled) return;
  if (seeded.done) return;
  for (const seed of CONFIG_GENERATOR_TEMPLATES) {
    const [existing] = await db.select().from(configGeneratorTemplatesTable).where(eq(configGeneratorTemplatesTable.templateKey, seed.templateKey)).limit(1);
    if (existing) continue;

    const [inserted] = await db.insert(configGeneratorTemplatesTable).values({
      name: seed.name,
      serviceType: seed.serviceType,
      vendor: seed.vendor,
      platform: seed.platform,
      templateKey: seed.templateKey,
      isActive: true,
    }).returning();
    if (!inserted) continue;

    await db.insert(configGeneratorTemplateVersionsTable).values({
      templateId: inserted.id,
      version: seed.version,
      content: seed.content,
      schemaJson: seed.schemaJson,
      renderer: seed.renderer,
      checksum: checksumJson({ content: seed.content, schemaJson: seed.schemaJson, renderer: seed.renderer }),
      createdBy: null,
    });
  }
  seeded.done = true;
}

export async function listConfigGeneratorTemplates(): Promise<ConfigGeneratorTemplateSummary[]> {
  if (!env.configGeneratorEnabled) return [];
  await ensureConfigGeneratorSeeded();
  const templates = await db.select().from(configGeneratorTemplatesTable).orderBy(configGeneratorTemplatesTable.name);
  const versions = await loadLatestVersionsForTemplates(templates.map((template) => template.id));
  return templates.map((template) => toTemplateSummary(template, versions.get(template.id) ?? null));
}

export async function getConfigGeneratorTemplateSchema(templateId: number) {
  await ensureConfigGeneratorSeeded();
  const [template] = await db.select().from(configGeneratorTemplatesTable).where(eq(configGeneratorTemplatesTable.id, templateId)).limit(1);
  if (!template) return null;
  const [version] = await db
    .select()
    .from(configGeneratorTemplateVersionsTable)
    .where(eq(configGeneratorTemplateVersionsTable.templateId, templateId))
    .orderBy(desc(configGeneratorTemplateVersionsTable.createdAt))
    .limit(1);
  if (!version) return null;
  return {
    template: toTemplateSummary(template, version),
    version: {
      id: version.id,
      version: version.version,
      renderer: version.renderer,
      checksum: version.checksum,
      content: version.content,
      schemaJson: version.schemaJson as ConfigGeneratorTemplateSchemaResponse["version"]["schemaJson"],
      createdAt: version.createdAt.toISOString(),
    },
  } satisfies ConfigGeneratorTemplateSchemaResponse;
}

export async function updateConfigGeneratorTemplate(templateId: number, patch: { isActive?: boolean }) {
  await ensureConfigGeneratorSeeded();
  const [updated] = await db
    .update(configGeneratorTemplatesTable)
    .set({
      ...(patch.isActive === undefined ? {} : { isActive: patch.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(configGeneratorTemplatesTable.id, templateId))
    .returning();
  return updated ?? null;
}

export async function createConfigGeneratorTemplateVersion(input: {
  templateId: number;
  version: string;
  content: string;
  schemaJson: Record<string, unknown>;
  renderer: string;
  createdBy?: number | null;
}) {
  const [created] = await db.insert(configGeneratorTemplateVersionsTable).values({
    templateId: input.templateId,
    version: input.version,
    content: input.content,
    schemaJson: input.schemaJson,
    renderer: input.renderer,
    checksum: checksumJson({ content: input.content, schemaJson: input.schemaJson, renderer: input.renderer }),
    createdBy: input.createdBy ?? null,
  }).returning();
  if (!created) return null;
  await db.update(configGeneratorTemplatesTable).set({ updatedAt: new Date() }).where(eq(configGeneratorTemplatesTable.id, input.templateId));
  return created;
}

async function extractInterfaceNames(rawConfig: string | null): Promise<string[]> {
  if (!rawConfig) return [];
  const names = new Set<string>();
  for (const line of rawConfig.split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = /^(?:interface|int)\s+(.+)$/i.exec(trimmed);
    if (match?.[1]) names.add(match[1].trim());
  }
  return [...names];
}

async function extractRoutePolicyNames(rawConfig: string | null): Promise<string[]> {
  if (!rawConfig) return [];
  const names = new Set<string>();
  for (const line of rawConfig.split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = /^route-policy\s+([^\s]+)/i.exec(trimmed);
    if (match?.[1]) names.add(match[1].trim());
  }
  return [...names];
}

async function loadDeviceScope(deviceId: number): Promise<DeviceScopeRow | null> {
  const [row] = await db
    .select({
      deviceId: devicesTable.id,
      hostname: devicesTable.hostname,
      vendor: devicesTable.vendor,
      platform: devicesTable.platform,
      connectorId: devicesTable.connectorId,
      connectorGroupId: devicesTable.connectorGroupId,
      tenantIdFromConnector: connectorsTable.tenantId,
      tenantIdFromGroup: connectorGroupsTable.tenantId,
      tenantNameFromConnector: tenantsTable.name,
      tenantNameFromGroup: tenantsTable.name,
    })
    .from(devicesTable)
    .leftJoin(connectorsTable, eq(devicesTable.connectorId, connectorsTable.id))
    .leftJoin(connectorGroupsTable, eq(devicesTable.connectorGroupId, connectorGroupsTable.id))
    .leftJoin(tenantsTable, or(eq(connectorsTable.tenantId, tenantsTable.id), eq(connectorGroupsTable.tenantId, tenantsTable.id)))
    .where(eq(devicesTable.id, deviceId))
    .limit(1);
  if (!row) return null;

  const [configRow] = await db
    .select({ rawConfig: collectedConfigsTable.rawConfig })
    .from(collectedConfigsTable)
    .where(eq(collectedConfigsTable.deviceId, deviceId))
    .orderBy(desc(collectedConfigsTable.collectedAt))
    .limit(1);

  const tenantId = row.tenantIdFromGroup ?? row.tenantIdFromConnector ?? null;
  const tenantName = row.tenantNameFromGroup ?? row.tenantNameFromConnector ?? null;
  const interfaceNames = await extractInterfaceNames(configRow?.rawConfig ?? null);
  const routePolicyNames = await extractRoutePolicyNames(configRow?.rawConfig ?? null);
  const [discoveryRow] = await db
    .select({ snapshotJson: discoverySnapshotsTable.snapshotJson })
    .from(discoverySnapshotsTable)
    .where(eq(discoverySnapshotsTable.deviceId, deviceId))
    .orderBy(desc(discoverySnapshotsTable.createdAt))
    .limit(1);
  const interfaceStates = Array.isArray((discoveryRow?.snapshotJson as { interfaces?: Array<{ name?: string; adminStatus?: string; operStatus?: string; kind?: string }> } | null)?.interfaces)
    ? ((discoveryRow?.snapshotJson as { interfaces?: Array<{ name?: string; adminStatus?: string; operStatus?: string; kind?: string }> } | null)?.interfaces ?? []).map((item) => ({
      name: String(item.name ?? "").trim(),
      adminStatus: (item.adminStatus === "up" || item.adminStatus === "down" ? item.adminStatus : "unknown") as "up" | "down" | "unknown",
      operStatus: (item.operStatus === "up" || item.operStatus === "down" ? item.operStatus : "unknown") as "up" | "down" | "unknown",
      kind: item.kind ?? null,
    })).filter((item) => item.name.length > 0)
    : [];

  return {
    deviceId: row.deviceId,
    hostname: row.hostname,
    vendor: row.vendor,
    platform: row.platform,
    tenantId,
    tenantName,
    connectorId: row.connectorId ?? null,
    connectorGroupId: row.connectorGroupId ?? null,
    latestConfig: configRow?.rawConfig ?? null,
    interfaceNames,
    interfaceStates,
    routePolicyNames,
  };
}

async function assertValidScope(input: ConfigGeneratorValidationInput): Promise<DeviceScopeRow> {
  const scope = await loadDeviceScope(input.deviceId);
  if (!scope) throw configGeneratorError("TENANT_DEVICE_MISMATCH", `Device ${input.deviceId} not found`, 400, { deviceId: input.deviceId, tenantId: input.tenantId });
  const match = validateDeviceTenantScope(scope.tenantId, input.tenantId);
  if (!match.ok) throw configGeneratorError(match.code, match.error, 400, { deviceId: input.deviceId, tenantId: input.tenantId });
  return scope;
}

async function loadTemplateAndVersion(templateId: number, templateVersionId?: number | null) {
  const [template] = await db.select().from(configGeneratorTemplatesTable).where(eq(configGeneratorTemplatesTable.id, templateId)).limit(1);
  if (!template) throw configGeneratorError("VALIDATION_FAILED", `Template ${templateId} not found`, 404, { templateId });

  let version: ConfigGeneratorTemplateVersion | null = null;
  if (templateVersionId != null) {
    [version] = await db
      .select()
      .from(configGeneratorTemplateVersionsTable)
      .where(and(eq(configGeneratorTemplateVersionsTable.templateId, templateId), eq(configGeneratorTemplateVersionsTable.id, templateVersionId)))
      .limit(1);
  } else {
    [version] = await db
      .select()
      .from(configGeneratorTemplateVersionsTable)
      .where(eq(configGeneratorTemplateVersionsTable.templateId, templateId))
      .orderBy(desc(configGeneratorTemplateVersionsTable.createdAt))
      .limit(1);
  }
  if (!version) throw configGeneratorError("VALIDATION_FAILED", `Template version not found for template ${templateId}`, 404, { templateId, templateVersionId });
  return { template, version };
}

function buildTicketMarkdown(
  device: DeviceScopeRow,
  template: ConfigGeneratorTemplate,
  input: ConfigGeneratorValidationInput,
  validation: ConfigGeneratorValidationSummary,
  blocks: ConfigGeneratorBlockOutput,
) {
  return [
    "# Config Generator",
    "",
    `- Device: ${device.hostname} (${input.deviceId})`,
    `- Tenant: ${device.tenantName ?? "unknown"}`,
    `- Template: ${template.name} (${template.templateKey})`,
    `- Validation: ${validation.status}`,
    "",
    "## Blocks",
    ...blocks.blocks.map((block) => `- ${block.title} [${block.classification}]`),
  ].join("\n");
}

function buildDiffNotes(validation: ConfigGeneratorValidationSummary) {
  return [
    `warnings=${validation.warnings.length}`,
    `errors=${validation.errors.length}`,
    ...validation.warnings.map((item) => `warning:${item.code}`),
    ...validation.errors.map((item) => `error:${item.code}`),
  ].join("\n");
}

async function persistRun(input: {
  validationInput: ConfigGeneratorValidationInput;
  template: ConfigGeneratorTemplate;
  version: ConfigGeneratorTemplateVersion;
  device: DeviceScopeRow;
  normalizedInput: Record<string, unknown>;
  validation: ConfigGeneratorValidationSummary;
  blocks: ConfigGeneratorBlockOutput;
  status: string;
  actorId?: number | null;
  fieldOrigins?: Record<string, string>;
}) {
  const safeInput = sanitizeConfigGeneratorInputForStorage(input.normalizedInput);
  const safeValidation = sanitizeConfigGeneratorValidationSummaryForStorage(input.validation);
  const safeValidationFindings = [...safeValidation.errors, ...safeValidation.warnings];
  const [run] = await db.insert(configGeneratorRunsTable).values({
    tenantId: input.validationInput.tenantId,
    deviceId: input.validationInput.deviceId,
    serviceType: input.template.serviceType,
    templateVersionId: input.version.id,
    status: input.status,
    inputJson: safeInput,
    fieldOriginsJson: input.fieldOrigins ?? {},
    renderedConfig: input.blocks.renderedConfig,
    validationSummary: safeValidation,
    riskLevel: input.validation.errors.length > 0 ? "high" : input.validation.warnings.length > 0 ? "medium" : "low",
    createdBy: input.actorId ?? null,
  }).returning();
  if (!run) throw configGeneratorError("VALIDATION_FAILED", "Failed to persist config generation run", 500);

  if (safeValidationFindings.length > 0) {
    await db.insert(configGeneratorValidationsTable).values(safeValidationFindings.map((finding) => ({
      runId: run.id,
      severity: finding.severity,
      code: finding.code,
      message: finding.message,
      contextJson: finding.context ?? {},
    })));
  }

  await db.insert(configGeneratorArtifactsTable).values([
    { runId: run.id, artifactType: "candidate_config", content: input.blocks.renderedConfig, checksum: checksumJson({ artifactType: "candidate_config", content: input.blocks.renderedConfig }) },
    { runId: run.id, artifactType: "postcheck_commands", content: input.blocks.postcheckCommands, checksum: checksumJson({ artifactType: "postcheck_commands", content: input.blocks.postcheckCommands }) },
    { runId: run.id, artifactType: "rollback_placeholder", content: input.blocks.rollbackPlaceholder, checksum: checksumJson({ artifactType: "rollback_placeholder", content: input.blocks.rollbackPlaceholder }) },
    { runId: run.id, artifactType: "ticket_markdown", content: buildTicketMarkdown(input.device, input.template, input.validationInput, input.validation, input.blocks), checksum: checksumJson({ artifactType: "ticket_markdown", content: buildTicketMarkdown(input.device, input.template, input.validationInput, input.validation, input.blocks) }) },
    { runId: run.id, artifactType: "diff_notes", content: buildDiffNotes(input.validation), checksum: checksumJson({ artifactType: "diff_notes", content: buildDiffNotes(input.validation) }) },
  ]);

  await logAuditEvent({
    actorId: input.actorId ?? null,
    action: input.status === "saved" ? "config_generator_run_saved" : "config_generator_run_previewed",
    objectType: "config_generation_run",
    objectId: String(run.id),
    metadata: {
      tenantId: input.validationInput.tenantId,
      deviceId: input.validationInput.deviceId,
      templateId: input.validationInput.templateId,
      templateVersionId: input.version.id,
      inputChecksum: checksumJson(safeInput),
      templateChecksum: input.version.checksum,
      outputChecksum: checksumJson(input.blocks.renderedConfig),
      riskLevel: run.riskLevel,
      validation: safeValidation,
    },
  });

  return run;
}

async function validateAndRender(input: ConfigGeneratorValidationInput) {
  await ensureConfigGeneratorSeeded();
  const device = await assertValidScope(input);
  const { template, version } = await loadTemplateAndVersion(input.templateId, input.templateVersionId);
  const normalizedInput = normalizeConfigGeneratorInput(input.input);

  const existingRuns = await db
    .select({ inputJson: configGeneratorRunsTable.inputJson })
    .from(configGeneratorRunsTable)
    .where(and(eq(configGeneratorRunsTable.deviceId, input.deviceId), eq(configGeneratorRunsTable.tenantId, input.tenantId)))
    .orderBy(desc(configGeneratorRunsTable.createdAt))
    .limit(100);
  const existingCircuitIds = existingRuns
    .map((row) => (row.inputJson as Record<string, unknown> | null)?.circuitId)
    .filter((value): value is string => typeof value === "string");
  const existingPeerRemoteIps = existingRuns
    .map((row) => (row.inputJson as Record<string, unknown> | null)?.peerRemoteIpv4)
    .filter((value): value is string => typeof value === "string");

  const communityLibraryRows = await db
    .select({ communityValue: communityLibraryItemsTable.communityValue })
    .from(communityLibraryItemsTable)
    .where(eq(communityLibraryItemsTable.deviceId, input.deviceId));
  const communitySetRows = await db
    .select({ communityValue: communitySetMembersTable.communityValue })
    .from(communitySetMembersTable)
    .innerJoin(communityLibraryItemsTable, eq(communitySetMembersTable.linkedLibraryItemId, communityLibraryItemsTable.id))
    .where(eq(communityLibraryItemsTable.deviceId, input.deviceId));
  const existingCommunities = [
    ...communityLibraryRows.map((row) => row.communityValue),
    ...communitySetRows.map((row) => row.communityValue),
  ];
  const existingRoutePolicies = await extractRoutePolicyNames(device.latestConfig);
  const existingVlanRows = await db
    .select({ vlan: l2CircuitsTable.outerVlan, innerVlan: l2CircuitsTable.innerVlan })
    .from(l2CircuitsTable)
    .where(eq(l2CircuitsTable.deviceId, input.deviceId));
  const existingVlans = [...new Set(existingVlanRows.flatMap((row) => [row.vlan, row.innerVlan]).filter((value): value is number => typeof value === "number"))];

  const [usedL2vcIds, usedVsiIds] = await Promise.all([
    getUsedIds({ tenantId: input.tenantId, deviceId: null, idType: "l2vc" }),
    getUsedIds({ tenantId: input.tenantId, deviceId: null, idType: "vsi" }),
  ]);
  const existingSubinterfaces = [...new Set(
    (device.latestConfig ?? "")
      .split(/\r?\n/)
      .map((line) => /^(?:interface|int)\s+(.+)$/i.exec(line.trim())?.[1])
      .filter((value): value is string => Boolean(value)),
  )];

  const compatibility = validateConfigGeneratorTemplateCompatibility({ vendor: template.vendor, platform: template.platform, device });
  const vlan = typeof normalizedInput.vlan === "number" ? normalizedInput.vlan : Number(normalizedInput.vlan);
  const idValidation = await validateRequestedId({
    tenantId: input.tenantId,
    deviceId: input.deviceId,
    serviceType: template.serviceType,
    vlan: Number.isInteger(vlan) ? vlan : null,
    subinterfaceId: typeof normalizedInput.subinterfaceId === "number" ? normalizedInput.subinterfaceId : Number(normalizedInput.subinterfaceId) || null,
    l2vcId: typeof normalizedInput.l2vcId === "number" ? normalizedInput.l2vcId : Number(normalizedInput.l2vcId) || null,
    vsiId: typeof normalizedInput.vsiId === "number" ? normalizedInput.vsiId : Number(normalizedInput.vsiId) || null,
    parentInterface: typeof normalizedInput.interface === "string" ? normalizedInput.interface : null,
  }).catch(() => ({ ok: true, warnings: [], blockingConflicts: [], fieldOrigins: {} }));

  const validation = mergeValidationSummaries(
    validateConfigGeneratorInput({
      serviceType: template.serviceType,
      device,
      templateKey: template.templateKey,
      normalizedInput,
      existingCircuitIds,
      existingCommunities,
      existingRoutePolicies,
      existingVlans,
      existingPeerRemoteIps,
      existingL2vcIds: usedL2vcIds,
      existingVsiIds: usedVsiIds,
      existingSubinterfaces,
    }),
    { status: "passed", warnings: compatibility.filter((item) => item.severity === "warning"), errors: compatibility.filter((item) => item.severity === "error") },
    {
      status: idValidation.blockingConflicts.length > 0 ? "failed" : idValidation.warnings.length > 0 ? "warning" : "passed",
      warnings: idValidation.warnings,
      errors: idValidation.blockingConflicts,
    },
  );

  const blocks = renderConfigGeneratorBlocks({
    templateKey: template.templateKey,
    templateContent: version.content,
    schemaJson: version.schemaJson as ConfigGeneratorTemplateSchemaResponse["version"]["schemaJson"],
    normalizedInput,
    device,
  });

  return { device, template, version, normalizedInput, validation, blocks };
}

export async function previewConfigGenerator(input: ConfigGeneratorValidationInput) {
  return validateAndRender(input);
}

export async function validateConfigGenerator(input: ConfigGeneratorValidationInput) {
  const result = await validateAndRender(input);
  const validation = sanitizeConfigGeneratorValidationSummaryForStorage(result.validation);
  return {
    validation,
    normalizedInput: sanitizeConfigGeneratorInputForStorage(result.normalizedInput),
    template: toTemplateSummary(result.template, result.version),
  };
}

export async function renderConfigGenerator(input: ConfigGeneratorValidationInput, actorId?: number | null): Promise<ConfigGeneratorRenderResponse> {
  const result = await validateAndRender(input);
  const run = await persistRun({
    validationInput: input,
    template: result.template,
    version: result.version,
    device: result.device,
    normalizedInput: result.normalizedInput,
    validation: result.validation,
    blocks: result.blocks,
    status: "previewed",
    actorId,
    fieldOrigins: input.fieldOrigins,
  });
  return {
    ok: true,
    runPreviewId: run.id,
    validation: sanitizeConfigGeneratorValidationSummaryForStorage(result.validation),
    blocks: result.blocks.blocks,
    renderedConfig: result.blocks.renderedConfig,
    postcheckCommands: result.blocks.postcheckCommands,
    rollbackPlaceholder: result.blocks.rollbackPlaceholder,
  };
}

export async function saveConfigGeneratorRun(input: ConfigGeneratorValidationInput, actorId?: number | null): Promise<ConfigGeneratorRunResponse> {
  const result = await validateAndRender(input);
  const run = await persistRun({
    validationInput: input,
    template: result.template,
    version: result.version,
    device: result.device,
    normalizedInput: result.normalizedInput,
    validation: result.validation,
    blocks: result.blocks,
    status: "saved",
    actorId,
    fieldOrigins: input.fieldOrigins,
  });
  return {
    ok: true,
    runId: run.id,
    validation: sanitizeConfigGeneratorValidationSummaryForStorage(result.validation),
    blocks: result.blocks.blocks,
    renderedConfig: result.blocks.renderedConfig,
    postcheckCommands: result.blocks.postcheckCommands,
    rollbackPlaceholder: result.blocks.rollbackPlaceholder,
  };
}

export async function listConfigGeneratorRuns(filters: { tenantId?: number; deviceId?: number; limit?: number } = {}) {
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
  const conditions: any[] = [];
  if (filters.tenantId) conditions.push(eq(configGeneratorRunsTable.tenantId, filters.tenantId));
  if (filters.deviceId) conditions.push(eq(configGeneratorRunsTable.deviceId, filters.deviceId));
  const whereClause = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: configGeneratorRunsTable.id,
      tenantId: configGeneratorRunsTable.tenantId,
      deviceId: configGeneratorRunsTable.deviceId,
      serviceType: configGeneratorRunsTable.serviceType,
      templateVersionId: configGeneratorRunsTable.templateVersionId,
      status: configGeneratorRunsTable.status,
      riskLevel: configGeneratorRunsTable.riskLevel,
      createdBy: configGeneratorRunsTable.createdBy,
      createdAt: configGeneratorRunsTable.createdAt,
      deviceHostname: devicesTable.hostname,
      tenantName: tenantsTable.name,
      templateName: configGeneratorTemplatesTable.name,
      templateVersion: configGeneratorTemplateVersionsTable.version,
    })
    .from(configGeneratorRunsTable)
    .leftJoin(devicesTable, eq(configGeneratorRunsTable.deviceId, devicesTable.id))
    .leftJoin(tenantsTable, eq(configGeneratorRunsTable.tenantId, tenantsTable.id))
    .leftJoin(configGeneratorTemplateVersionsTable, eq(configGeneratorRunsTable.templateVersionId, configGeneratorTemplateVersionsTable.id))
    .leftJoin(configGeneratorTemplatesTable, eq(configGeneratorTemplateVersionsTable.templateId, configGeneratorTemplatesTable.id))
    .where(whereClause)
    .orderBy(desc(configGeneratorRunsTable.createdAt))
    .limit(limit);

  return rows.map((row): ConfigGeneratorRunListItem => ({
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenantName ?? null,
    deviceId: row.deviceId,
    deviceHostname: row.deviceHostname ?? null,
    serviceType: row.serviceType,
    templateVersionId: row.templateVersionId,
    templateName: row.templateName ?? null,
    templateVersion: row.templateVersion ?? null,
    status: row.status,
    riskLevel: row.riskLevel,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getConfigGeneratorRun(runId: number): Promise<ConfigGeneratorRunDetail | null> {
  const [row] = await db
    .select({
      id: configGeneratorRunsTable.id,
      tenantId: configGeneratorRunsTable.tenantId,
      deviceId: configGeneratorRunsTable.deviceId,
      serviceType: configGeneratorRunsTable.serviceType,
      templateVersionId: configGeneratorRunsTable.templateVersionId,
      status: configGeneratorRunsTable.status,
      riskLevel: configGeneratorRunsTable.riskLevel,
      createdBy: configGeneratorRunsTable.createdBy,
      createdAt: configGeneratorRunsTable.createdAt,
      inputJson: configGeneratorRunsTable.inputJson,
      renderedConfig: configGeneratorRunsTable.renderedConfig,
      validationSummary: configGeneratorRunsTable.validationSummary,
      fieldOriginsJson: configGeneratorRunsTable.fieldOriginsJson,
      deviceHostname: devicesTable.hostname,
      tenantName: tenantsTable.name,
      templateName: configGeneratorTemplatesTable.name,
      templateVersion: configGeneratorTemplateVersionsTable.version,
    })
    .from(configGeneratorRunsTable)
    .leftJoin(devicesTable, eq(configGeneratorRunsTable.deviceId, devicesTable.id))
    .leftJoin(tenantsTable, eq(configGeneratorRunsTable.tenantId, tenantsTable.id))
    .leftJoin(configGeneratorTemplateVersionsTable, eq(configGeneratorRunsTable.templateVersionId, configGeneratorTemplateVersionsTable.id))
    .leftJoin(configGeneratorTemplatesTable, eq(configGeneratorTemplateVersionsTable.templateId, configGeneratorTemplatesTable.id))
    .where(eq(configGeneratorRunsTable.id, runId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenantName ?? null,
    deviceId: row.deviceId,
    deviceHostname: row.deviceHostname ?? null,
    serviceType: row.serviceType,
    templateVersionId: row.templateVersionId,
    templateName: row.templateName ?? null,
    templateVersion: row.templateVersion ?? null,
    status: row.status,
    riskLevel: row.riskLevel,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt.toISOString(),
    inputJson: row.inputJson as Record<string, unknown>,
    renderedConfig: row.renderedConfig,
    validationSummary: row.validationSummary as ConfigGeneratorValidationSummary,
    fieldOrigins: (row.fieldOriginsJson as ConfigGeneratorFieldOrigins | null) ?? {},
  };
}

export async function getConfigGeneratorRunArtifacts(runId: number): Promise<ConfigGeneratorArtifactResponse[]> {
  const rows = await db
    .select()
    .from(configGeneratorArtifactsTable)
    .where(eq(configGeneratorArtifactsTable.runId, runId))
    .orderBy(configGeneratorArtifactsTable.id);
  return rows.map((row) => ({
    id: row.id,
    runId: row.runId,
    artifactType: row.artifactType as ConfigGeneratorArtifactResponse["artifactType"],
    content: row.content,
    checksum: row.checksum,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getConfigGeneratorChangeRequest(runId: number) {
  const [row] = await db.select().from(configGeneratorChangeRequestsTable).where(eq(configGeneratorChangeRequestsTable.generationRunId, runId)).limit(1);
  return row ?? null;
}

export async function ensureConfigGeneratorWriteAllowed() {
  if (!env.configWriteEnabled) {
    return { allowed: false as const, reason: CONFIG_GENERATOR_REASONS.writeBlocked };
  }
  return { allowed: true as const };
}

export async function getConfigGeneratorFeatureEnabled() {
  return env.configGeneratorEnabled;
}
