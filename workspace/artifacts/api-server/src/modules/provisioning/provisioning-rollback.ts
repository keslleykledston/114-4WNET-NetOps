import { renderTemplateString, withPreviewHeader } from "./provisioning-renderer.js";
import type { ProvisioningTemplateDefinition } from "./provisioning.types.js";

export function renderRollbackPreview(
  template: ProvisioningTemplateDefinition,
  parameters: Record<string, unknown>,
  rollbackPlan?: string | null,
): string {
  const sensitiveKeys = Object.entries(template.parameterSchema)
    .filter(([, schema]) => schema.sensitive)
    .map(([key]) => key);

  const fromTemplate = withPreviewHeader(
    renderTemplateString(template.rollbackTemplate, parameters, { maskSensitive: true, sensitiveKeys }),
  );

  if (rollbackPlan?.trim()) {
    return `${rollbackPlan.trim()}\n\n--- Template rollback ---\n${fromTemplate}`;
  }

  return fromTemplate;
}
