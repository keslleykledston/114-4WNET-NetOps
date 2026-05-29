const PREVIEW_HEADER = "# PREVIEW ONLY — not applied. CONFIG_APPLY_ENABLED=false by default.\n";

export function withPreviewHeader(body: string): string {
  return `${PREVIEW_HEADER}${body.trim()}\n`;
}

export function renderTemplateString(
  template: string,
  parameters: Record<string, unknown>,
  options?: { maskSensitive?: boolean; sensitiveKeys?: string[] },
): string {
  const sensitiveKeys = new Set(options?.sensitiveKeys ?? ["password", "authPassword", "key"]);
  let rendered = template;

  rendered = rendered.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_match, key: string, block: string) => {
    const value = parameters[key];
    if (value === undefined || value === null || String(value).trim() === "") {
      return "";
    }
    return block;
  });

  for (const [key, value] of Object.entries(parameters)) {
    if (value === undefined || value === null || String(value).trim() === "") {
      continue;
    }
    const replacement = options?.maskSensitive && sensitiveKeys.has(key)
      ? "***REDACTED***"
      : String(value);
    rendered = rendered.replaceAll(`{{${key}}}`, replacement);
    rendered = rendered.replaceAll(`{{ ${key} }}`, replacement);
  }

  return rendered.replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function buildExecutionPlan(serviceType: string, parameters: Record<string, unknown>): string[] {
  const hostname = String(parameters.hostname ?? "target-device");
  return [
    `Review generated plan for ${serviceType} on ${hostname}`,
    "Confirm maintenance window with NOC",
    "Export plan and attach to change ticket",
    "Obtain approval (workflow v0.4.2)",
    "Execute remains blocked while CONFIG_APPLY_ENABLED=false",
    "Post-check with read-only discovery/compliance after future controlled apply",
  ];
}
