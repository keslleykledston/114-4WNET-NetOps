import { parse as parseYaml } from "yaml";
import { renderTemplateString } from "./provisioning-renderer";

export interface DslInput {
  type: "string" | "integer" | "ipv4" | "ipv6" | "boolean";
  required?: boolean;
  sensitive?: boolean;
  description?: string;
  min?: number;
  max?: number;
}

export interface TemplateDsl {
  meta: {
    name: string;
    vendor: string;
    platform: string;
    service_type: string;
    version?: string;
    description?: string;
  };
  inputs: Record<string, DslInput>;
  template_body: string;
  validation?: {
    precheckHints?: string[];
    postcheckHints?: string[];
    risks?: string[];
  };
}

export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export interface CompileResult {
  cli: string;
  preview: string;
  warnings: string[];
}

const BLOCKED_COMMANDS = [
  "reboot",
  "reset",
  "reload",
  "shutdown",
  "delete",
  "undo",
  "system-view",
  "configure",
  "commit",
  "save",
];

const VALID_SERVICE_TYPES = [
  "bgp_peer_customer",
  "bgp_peer_provider",
  "l3vpn_vrf",
  "l2vpn_vpws",
  "l2vpn_vpls",
  "interface_subinterface",
  "route_policy",
  "community_filter",
  "prefix_list",
];

function extractVariablesFromTemplate(template: string): string[] {
  const regex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
  const variables = new Set<string>();
  let match;
  while ((match = regex.exec(template)) !== null) {
    variables.add(match[1]);
  }
  return Array.from(variables);
}

function checkBlockedCommands(template: string): string[] {
  const errors: string[] = [];
  const lines = template.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    for (const cmd of BLOCKED_COMMANDS) {
      if (trimmed.match(new RegExp(`^${cmd}\\b`))) {
        errors.push(`Line ${i + 1}: command '${cmd}' is blocked`);
      }
    }
  }
  return errors;
}

function generateExampleValue(input: DslInput, fieldName: string): string {
  if (input.type === "integer") {
    return input.min ? String(input.min) : "1";
  }
  if (input.type === "boolean") {
    return "true";
  }
  if (input.type === "ipv4") {
    return "192.168.1.1";
  }
  if (input.type === "ipv6") {
    return "2001:db8::1";
  }
  if (input.sensitive) {
    return "[REDACTED]";
  }
  return fieldName;
}

export function parseDsl(yamlString: string): TemplateDsl {
  const obj = parseYaml(yamlString);
  if (!obj || typeof obj !== "object") {
    throw new Error("Invalid YAML: root must be an object");
  }
  if (!obj.meta || !obj.inputs || !obj.template_body) {
    throw new Error("Missing required fields: meta, inputs, template_body");
  }
  return obj as TemplateDsl;
}

export function validateTemplate(dsl: TemplateDsl): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!dsl.meta.name || !dsl.meta.vendor || !dsl.meta.service_type) {
    errors.push("Missing required meta fields: name, vendor, service_type");
  }

  if (!VALID_SERVICE_TYPES.includes(dsl.meta.service_type) && !dsl.meta.service_type.startsWith("custom_")) {
    errors.push(`Invalid service_type: ${dsl.meta.service_type}`);
  }

  if (!dsl.inputs || Object.keys(dsl.inputs).length === 0) {
    warnings.push("Template has no inputs");
  } else {
    for (const [field, input] of Object.entries(dsl.inputs)) {
      if (!input.type) {
        errors.push(`Input '${field}' missing type`);
      } else if (!["string", "integer", "ipv4", "ipv6", "boolean"].includes(input.type)) {
        errors.push(`Input '${field}' has invalid type: ${input.type}`);
      }

      if (input.type === "integer" && input.min !== undefined && input.max !== undefined) {
        if (input.min > input.max) {
          errors.push(`Input '${field}' min > max`);
        }
      }
    }
  }

  const cmdErrors = checkBlockedCommands(dsl.template_body);
  errors.push(...cmdErrors);

  const templateVars = extractVariablesFromTemplate(dsl.template_body);
  const definedVars = Object.keys(dsl.inputs);
  for (const v of templateVars) {
    if (!definedVars.includes(v)) {
      errors.push(`Variable '${v}' used in template but not defined in inputs`);
    }
  }

  for (const v of definedVars) {
    if (dsl.inputs[v].required && !templateVars.includes(v)) {
      warnings.push(`Required input '${v}' not used in template`);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

export function generatePreview(dsl: TemplateDsl): CompileResult {
  const validation = validateTemplate(dsl);
  if (!validation.passed) {
    throw new Error(`Validation failed: ${validation.errors.join("; ")}`);
  }

  const exampleParams: Record<string, string> = {};
  for (const [field, input] of Object.entries(dsl.inputs)) {
    exampleParams[field] = generateExampleValue(input, field);
  }

  const rendered = renderTemplateString(dsl.template_body, exampleParams, { maskSensitive: true });

  return {
    cli: rendered,
    preview: rendered,
    warnings: validation.warnings,
  };
}

export async function compileToDraft(dsl: TemplateDsl, db: any, actor: string): Promise<number> {
  const validation = validateTemplate(dsl);
  if (!validation.passed) {
    throw new Error(`Validation failed: ${validation.errors.join("; ")}`);
  }

  const draft = await db
    .insert(await import("@workspace/db").then((m) => m.templateDraftsTable))
    .values({
      draftBody: JSON.stringify(dsl),
      status: "DRAFT",
      createdBy: actor,
    })
    .returning();

  return draft[0]?.id || 0;
}
