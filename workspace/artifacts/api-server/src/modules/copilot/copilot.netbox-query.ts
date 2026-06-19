import { env } from "../../lib/env.js";
import { NetBoxError } from "../netbox/netbox.client.js";
import { getNetBoxStatus, previewDeviceSync } from "../netbox/netbox.service.js";
import type { CopilotNetboxMatch, CopilotNetboxSummary } from "./copilot.types.js";

const DEFAULT_MAX_MATCHES = 20;

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function normalizeNeedle(value: string): string {
  return value.trim().toLowerCase();
}

function matchesFreeText(item: CopilotNetboxMatch, freeText: string): boolean {
  const needle = normalizeNeedle(freeText);
  if (!needle) return true;
  const haystack = [
    item.hostname,
    item.site ?? "",
    item.role ?? "",
    item.vendor ?? "",
    item.platform ?? "",
    item.ipAddress ?? "",
  ].join(" ").toLowerCase();
  return haystack.includes(needle) || needle.split(/\s+/).some((token) => token.length >= 3 && haystack.includes(token));
}

export function isCopilotNetboxEnabled(): boolean {
  return parseBoolean(process.env["NETOPS_COPILOT_NETBOX_ENABLED"], false);
}

export function getCopilotNetboxConfig() {
  return {
    enabled: isCopilotNetboxEnabled(),
    netboxEnabled: env.netboxEnabled,
    maxMatches: Number.parseInt(process.env["NETOPS_COPILOT_NETBOX_MAX_MATCHES"] ?? "", 10) || DEFAULT_MAX_MATCHES,
    readOnly: true,
  };
}

export function isCopilotNetboxOperational(): boolean {
  const config = getCopilotNetboxConfig();
  return config.enabled && config.netboxEnabled;
}

export async function queryNetboxInventoryInScope(input: {
  freeText: string;
  deviceIds: number[];
  deviceHostnames: string[];
  siteFilter?: string | null;
}): Promise<{
  matches: CopilotNetboxMatch[];
  summary: CopilotNetboxSummary | null;
  notes: string[];
}> {
  const config = getCopilotNetboxConfig();
  const notes: string[] = [];

  if (!config.enabled) {
    return {
      matches: [],
      summary: null,
      notes: ["NetBox no copilot desabilitado (NETOPS_COPILOT_NETBOX_ENABLED=false)."],
    };
  }

  if (!config.netboxEnabled) {
    return {
      matches: [],
      summary: null,
      notes: ["Integracao NetBox desabilitada (NETBOX_ENABLED=false)."],
    };
  }

  let status;
  try {
    status = await getNetBoxStatus();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { matches: [], summary: null, notes: [`NetBox status indisponivel: ${message}`] };
  }

  if (status.readiness !== "ready") {
    return {
      matches: [],
      summary: {
        totalFromNetBox: 0,
        matchedByNetboxId: 0,
        matchedByHostname: 0,
        toCreate: 0,
        toUpdate: 0,
        toSkip: 0,
        readiness: status.readiness,
      },
      notes: [`NetBox nao pronto (readiness=${status.readiness}). Configure NETBOX_URL e NETBOX_TOKEN.`],
    };
  }

  try {
    const preview = await previewDeviceSync();
    const scopeHostnames = new Set(input.deviceHostnames.map((hostname) => normalizeNeedle(hostname)));
    const siteNeedle = input.siteFilter ? normalizeNeedle(input.siteFilter) : null;

    let matches: CopilotNetboxMatch[] = preview.items.map((item) => ({
      netboxDeviceId: item.netboxDeviceId,
      hostname: item.hostname,
      ipAddress: item.ipAddress,
      site: item.site,
      role: item.role,
      vendor: item.vendor,
      platform: item.platform,
      syncAction: item.action,
      localDeviceId: item.matchedLocalDeviceId,
      matchReason: item.warnings[0] ?? (item.matchedLocalDeviceId ? "matched_local" : "unmatched"),
      warnings: item.warnings,
    }));

    if (input.deviceIds.length > 0) {
      matches = matches.filter((item) =>
        scopeHostnames.has(normalizeNeedle(item.hostname))
        || (item.localDeviceId != null && input.deviceIds.includes(item.localDeviceId)),
      );
    }

    if (siteNeedle) {
      matches = matches.filter((item) => normalizeNeedle(item.site ?? "").includes(siteNeedle));
    }

    if (input.freeText.trim()) {
      matches = matches.filter((item) => matchesFreeText(item, input.freeText));
    }

    matches = matches.slice(0, config.maxMatches);

    const summary: CopilotNetboxSummary = {
      ...preview.summary,
      readiness: status.readiness,
    };

    if (matches.length > 0) {
      notes.push(`NetBox: ${matches.length} device(s) no escopo (preview read-only, total remoto=${preview.summary.totalFromNetBox}).`);
    } else {
      notes.push(`NetBox: nenhum device correspondente no preview (total remoto=${preview.summary.totalFromNetBox}).`);
    }

    return { matches, summary, notes };
  } catch (error) {
    if (error instanceof NetBoxError) {
      return { matches: [], summary: null, notes: [`NetBox API: ${error.message}`] };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { matches: [], summary: null, notes: [`NetBox query falhou: ${message}`] };
  }
}
