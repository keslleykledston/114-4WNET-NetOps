import type { Device } from "@workspace/db";
import { decrypt } from "../../../../lib/crypto.js";
import { runSSHCommands, type SSHCommandResult, type SSHConfig } from "../../../../lib/ssh.js";
import { validateReadonlyCommand } from "../../huawei-vrp/commands.js";
import { parseHuaweiCommunityFilterDisplay } from "../../huawei-vrp/parsers/community-parser.js";
import { normalizePolicyObjectName } from "../../huawei-vrp/parsers/policy-utils.js";
import { sanitizeEvidence } from "../../../compliance/evidence-builder.js";

export interface CommunityFilterVerificationEntry {
  action: string;
  value: string;
  index?: number | null;
}

export interface CommunityFilterVerificationResult {
  name: string;
  exists: boolean | null;
  source: "snapshot" | "ssh_display" | "unknown";
  confidence: "high" | "medium" | "low" | "unknown";
  entries: CommunityFilterVerificationEntry[];
  listId?: number | null;
  rawEvidence?: string;
  error?: string;
}

export interface CommunityFilterVerificationOptions {
  password?: string;
  executor?: (config: SSHConfig, commands: string[]) => Promise<SSHCommandResult[]>;
}

const SAFE_COMMUNITY_FILTER_NAME = /^[A-Za-z0-9_.:-]+$/;

function normalizeOutputText(value: string): string {
  return value
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\r/g, "")
    .trim()
    .slice(0, 2000);
}

function validateCommunityFilterName(name: string): string | null {
  const normalized = normalizePolicyObjectName(name);
  if (!normalized || !SAFE_COMMUNITY_FILTER_NAME.test(normalized)) return null;
  return normalized;
}

function buildUnknownResult(name: string, message: unknown, rawEvidence?: string): CommunityFilterVerificationResult {
  const text = message instanceof Error ? message.message : typeof message === "string" ? message : String(message ?? "");
  return {
    name,
    exists: null,
    source: "unknown",
    confidence: "unknown",
    entries: [],
    rawEvidence: rawEvidence ? normalizeOutputText(rawEvidence) : undefined,
    error: sanitizeEvidence(text, 300),
  };
}

export async function verifyCommunityFilterByName(
  device: Device,
  name: string,
  options: CommunityFilterVerificationOptions = {},
): Promise<CommunityFilterVerificationResult> {
  const normalizedName = validateCommunityFilterName(name);
  if (!normalizedName) {
    return buildUnknownResult(normalizePolicyObjectName(name), "invalid community-filter name");
  }

  const command = `display ip community-filter ${normalizedName}`;
  const commandCheck = validateReadonlyCommand(command);
  if (!commandCheck.allowed) {
    return buildUnknownResult(normalizedName, commandCheck.reason ?? "command blocked");
  }

  try {
    const password = options.password ?? decrypt(device.passwordEncrypted);
    const executor = options.executor ?? runSSHCommands;
    const results = await executor(
      {
        host: device.ipAddress,
        port: device.sshPort,
        username: device.username,
        password,
      },
      [command],
    );
    const result = results[0];
    const rawOutput = normalizeOutputText(result?.output ?? "");

    if (result?.error) {
      return buildUnknownResult(normalizedName, result.error, rawOutput);
    }

    const parsed = parseHuaweiCommunityFilterDisplay(result?.output ?? "", normalizedName);
    if (parsed.exists === true) {
      return {
        name: parsed.name,
        exists: true,
        source: "ssh_display",
        confidence: "high",
        entries: parsed.entries.map((entry) => ({
          action: entry.action,
          value: entry.value,
          index: entry.index ?? null,
        })),
        listId: parsed.listId,
        rawEvidence: parsed.rawEvidence,
      };
    }

    if (parsed.exists === false) {
      return {
        name: normalizedName,
        exists: false,
        source: "ssh_display",
        confidence: "high",
        entries: [],
        listId: null,
        rawEvidence: parsed.rawEvidence,
        error: sanitizeEvidence(parsed.error ?? `community-filter ${normalizedName} not found`, 300),
      };
    }

    return buildUnknownResult(normalizedName, parsed.error ?? "unable to parse community-filter display output", rawOutput);
  } catch (error) {
    return buildUnknownResult(normalizedName, error, "");
  }
}
