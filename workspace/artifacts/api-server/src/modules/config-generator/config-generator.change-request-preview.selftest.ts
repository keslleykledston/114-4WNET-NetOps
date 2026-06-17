import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env["DATABASE_URL"] ??= "postgres://selftest:selftest@127.0.0.1:1/selftest";
process.env["CONFIG_GENERATOR_ENABLED"] ??= "true";
process.env["CONFIG_WRITE_ENABLED"] ??= "false";

const preview = await import("./config-generator-change-request-preview.service.js");
const auth = await import("../../lib/auth.js");
const env = await import("../../lib/env.js");
const routes = fs.readFileSync(path.resolve(import.meta.dirname, "config-generator.routes.ts"), "utf8");
const engine = await import("./config-generator.engine.js");

const lowRisk = preview.assessRisk({
  validation: { status: "passed", warnings: [], errors: [] },
  diff: {
    status: "ok",
    baseline: { source: "collected_configs", deviceId: 1, collectedAt: null },
    summary: { alreadyPresent: 0, newCandidate: 3, conflicts: 0, manualReview: 0, unknown: 0, missingDependencies: 0, globalExisting: 1, globalMissing: 0 },
    blocks: [],
    blocking: false,
    warnings: [],
    errors: [],
    renderedConfig: "",
    candidateChecksum: "a",
    baselineChecksum: "b",
  },
  idConflicts: [],
  baselineMissing: false,
});
assert.equal(lowRisk.riskLevel, "low");

const mediumRisk = preview.assessRisk({
  validation: {
    status: "warning",
    warnings: [{ severity: "warning", code: "global_dependency_missing", message: "Global missing" }],
    errors: [],
  },
  diff: {
    status: "ok",
    baseline: { source: "collected_configs", deviceId: 1, collectedAt: null },
    summary: { alreadyPresent: 0, newCandidate: 1, conflicts: 0, manualReview: 1, unknown: 0, missingDependencies: 0, globalExisting: 0, globalMissing: 1 },
    blocks: [],
    blocking: false,
    warnings: [],
    errors: [],
    renderedConfig: "",
    candidateChecksum: "a",
    baselineChecksum: "b",
  },
  idConflicts: [],
  baselineMissing: false,
});
assert.equal(mediumRisk.riskLevel, "medium");

const highRisk = preview.assessRisk({
  validation: {
    status: "failed",
    warnings: [],
    errors: [{ severity: "error", code: "route_policy_conflict", message: "Route policy conflict" }],
  },
  diff: null,
  idConflicts: [{ severity: "error", code: "id_occupied", message: "vlan 601 occupied" }],
  baselineMissing: true,
});
assert.equal(highRisk.riskLevel, "high");

const blockedRisk = preview.assessRisk({
  validation: {
    status: "failed",
    warnings: [],
    errors: [{ severity: "error", code: "missing_required_field", message: "Campo obrigatório" }],
  },
  diff: {
    status: "ok",
    baseline: { source: "collected_configs", deviceId: 1, collectedAt: null },
    summary: { alreadyPresent: 0, newCandidate: 0, conflicts: 2, manualReview: 0, unknown: 0, missingDependencies: 0, globalExisting: 0, globalMissing: 0 },
    blocks: [],
    blocking: true,
    warnings: [],
    errors: [],
    renderedConfig: "",
    candidateChecksum: "a",
    baselineChecksum: "b",
  },
  idConflicts: [],
  baselineMissing: false,
});
assert.equal(blockedRisk.riskLevel, "blocked");

const ticket = preview.buildTicketMarkdown({
  runId: 1,
  deviceId: 20,
  serviceType: "l2vpn_vlan",
  templateKey: "huawei_l2vpn",
  riskLevel: "low",
  summary: {
    title: "Test",
    description: "Desc",
    deviceName: "R1",
    vendor: "huawei",
    platform: "vrp",
  },
  scope: { tenant: "T1", site: "BVA", device: "R1", interfaces: [], bgpPeers: [], vlans: [601], l2vcIds: [], vsiIds: [] },
  inputs: { fieldOrigins: {}, manualFields: [], suggestedFields: ["vlan"] },
  validations: { errors: [], warnings: [], infos: [] },
  diff: {
    baseline: { source: "collected_configs", deviceId: 20, collectedAt: null },
    summary: { alreadyPresent: 0, newCandidate: 1, conflicts: 0, manualReview: 0, unknown: 0, missingDependencies: 0, globalExisting: 0, globalMissing: 0 },
    blocking: false,
  },
  candidateConfig: `peer 1.1.1.1 password ${engine.CONFIG_GENERATOR_SECRET_PLACEHOLDER}`,
  postcheckCommands: "display interface",
  rollbackPlan: { type: "manual_placeholder", notes: ["manual"], content: "# no auto global removal" },
  riskAssessment: { score: 10, factors: [] },
  generatedAt: new Date().toISOString(),
});

assert(ticket.includes("Nenhum comando foi executado pelo sistema."));
assert(ticket.includes("Secrets não foram persistidos."));
assert(ticket.includes("Objetos globais não devem ser removidos."));
assert(!ticket.includes("super-secret-password"), "ticket must not leak secrets");

assert(routes.includes("/config-generator/runs/:id/change-request-preview"));
assert(routes.includes("configGenerator.validate"), "generate requires validate permission");
assert(routes.includes("configGenerator.read"), "get requires read permission");
assert(!routes.includes("controlledExecution"), "must not call Controlled Execution");
assert(routes.includes("writeDisabledResponse()"), "execute remains blocked");

assert.equal(env.env.configWriteEnabled, false);

const viewerPerms = auth.getDefaultPermissions("viewer");
assert.equal(viewerPerms.configGenerator?.validate, false);
const operatorPerms = auth.getDefaultPermissions("operator");
assert.equal(operatorPerms.configGenerator?.validate, true);

const serviceSource = fs.readFileSync(path.resolve(import.meta.dirname, "config-generator-change-request-preview.service.ts"), "utf8");
assert(serviceSource.includes("change_request_preview"), "must persist change_request_preview artifact");
assert(serviceSource.includes("insert(configGeneratorArtifactsTable)"), "must append artifacts");
assert(!serviceSource.includes("ssh"), "must not collect from device");
assert(serviceSource.includes("manual_placeholder"), "rollback stays manual");

const uiSource = fs.readFileSync(path.resolve(import.meta.dirname, "../../../../netops-manager/src/pages/config-generator.tsx"), "utf8");
assert(uiSource.includes("ConfigGeneratorChangeRequestPreviewPanel"));
assert(!uiSource.includes("Executar"), "UI must not expose execute");
assert(!uiSource.includes("Aprovar"), "UI must not expose approve");

console.log("config-generator.change-request-preview.selftest: OK");
