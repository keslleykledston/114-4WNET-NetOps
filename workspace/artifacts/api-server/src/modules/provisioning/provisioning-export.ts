import type { ProvisioningPreviewResult } from "./provisioning.types.js";

function maskSensitiveParameters(parameters: Record<string, unknown>): Record<string, unknown> {
  const sensitive = new Set(["password", "authPassword", "key"]);
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parameters)) {
    masked[key] = sensitive.has(key) && value !== undefined && value !== null && String(value).trim() !== ""
      ? "***REDACTED***"
      : value;
  }
  return masked;
}

export function exportProvisioningPreviewMarkdown(
  preview: ProvisioningPreviewResult,
  parameters: Record<string, unknown>,
): string {
  const maskedParams = maskSensitiveParameters(parameters);

  const validationLines = preview.validations.map(
    (item) => `- [${item.passed ? "PASS" : "FAIL"}] ${item.name}: ${item.message}`,
  );
  const riskLines = preview.risks.map((risk) => `- (${risk.severity}) ${risk.message}`);
  const precheckLines = preview.precheckHints.map((item) => `- ${item}`);
  const postcheckLines = preview.postcheckHints.map((item) => `- ${item}`);
  const executionLines = preview.executionPlan.map((item) => `- ${item}`);

  return [
    "# Provisioning Preview Plan",
    "",
    "> **AVISO:** Nenhuma configuração foi aplicada. Preview/export only.",
    "",
    "## Metadata",
    `- Device ID: ${preview.deviceId}`,
    `- Template ID: ${preview.templateId}`,
    `- Service type: ${preview.serviceType}`,
    `- Status: ${preview.status}`,
    `- Apply blocked: ${preview.applyBlocked ? "yes" : "no"}`,
    preview.applyBlockedReason ? `- Apply blocked reason: ${preview.applyBlockedReason}` : null,
    "",
    "## Parameters",
    "```json",
    JSON.stringify(maskedParams, null, 2),
    "```",
    "",
    "## Execution Plan",
    executionLines.join("\n"),
    "",
    "## Config Preview",
    "```text",
    preview.configPreview,
    "```",
    "",
    "## Rollback Preview",
    "```text",
    preview.rollbackPreview,
    "```",
    "",
    "## Validations",
    validationLines.length ? validationLines.join("\n") : "- None",
    "",
    "## Risks",
    riskLines.length ? riskLines.join("\n") : "- None",
    "",
    "## Precheck Hints",
    precheckLines.length ? precheckLines.join("\n") : "- None",
    "",
    "## Postcheck Hints",
    postcheckLines.length ? postcheckLines.join("\n") : "- None",
    "",
    preview.blockedReasons.length ? "## Blocked Reasons" : null,
    preview.blockedReasons.length ? preview.blockedReasons.map((item) => `- ${item}`).join("\n") : null,
    preview.missingData.length ? "## Missing Data" : null,
    preview.missingData.length ? preview.missingData.map((item) => `- ${item}`).join("\n") : null,
    "",
    "## Safety Notice",
    "- CONFIG_APPLY_ENABLED=false",
    "- DRY_RUN_DEFAULT=true",
    "- No device configuration was applied by this export.",
  ].filter((line) => line !== null).join("\n");
}
