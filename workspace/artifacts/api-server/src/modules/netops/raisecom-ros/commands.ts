import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import type { ReadonlyCommandCheck } from "../adapters/adapter-types.js";

type RaisecomVocabulary = {
  library?: Record<string, unknown>;
};

const BLOCKED_TOKENS = [
  /\bconfigure\b/i,
  /\bconfig\b/i,
  /\bcommit\b/i,
  /\bwrite\s+memory\b/i,
  /\berase\b/i,
  /\breload\b/i,
  /\breboot\b/i,
  /\bcopy\s+running-config\b/i,
];

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

function resolveVocabPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(moduleDir, "vocab", "raisecom_ros_vocab_library.yaml"),
    path.join(process.cwd(), "dist", "vocab", "raisecom_ros_vocab_library.yaml"),
    path.join(process.cwd(), "artifacts/api-server/dist/vocab/raisecom_ros_vocab_library.yaml"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

const FALLBACK_COMMANDS = [
  "show running-config",
  "show version",
  "show interface",
  "show ip interface brief",
  "show vlan",
  "show ip bgp summary",
  "show bgp all summary",
  "show mpls l2vc",
  "show ip vrf",
] as const;

function loadVocabularyCommands(): string[] {
  try {
    const vocabPath = resolveVocabPath();
    const raw = readFileSync(vocabPath, "utf8");
    const parsed = parseYaml(raw) as RaisecomVocabulary;
    const library = parsed.library && typeof parsed.library === "object"
      ? parsed.library as Record<string, unknown>
      : {};

    const commands = Object.values(library)
      .flatMap((value) => Array.isArray(value) ? value : [])
      .filter((value): value is string => typeof value === "string")
      .map(normalizeCommand)
      .filter(Boolean);

    if (commands.length > 0) return [...new Set(commands)];
  } catch {
    // Fall back to bundled defaults when vocab file is unavailable.
  }
  return [...FALLBACK_COMMANDS];
}

export const RAISECOM_ROS_READONLY_COMMANDS = loadVocabularyCommands();

export function validateReadonlyCommand(command: string): ReadonlyCommandCheck {
  const normalized = normalizeCommand(command);

  if (!normalized) {
    return { command, allowed: false, reason: "Empty command blocked." };
  }
  if (BLOCKED_TOKENS.some((pattern) => pattern.test(normalized))) {
    return { command: normalized, allowed: false, reason: "Command contains blocked configuration or destructive token." };
  }
  if (!/^(show)\b/i.test(normalized)) {
    return { command: normalized, allowed: false, reason: "Only show read-only commands are allowed." };
  }
  if (!RAISECOM_ROS_READONLY_COMMANDS.some((allowed) => normalizeCommand(allowed).toLowerCase() === normalized.toLowerCase())) {
    return { command: normalized, allowed: false, reason: "Command is not in Raisecom ROS read-only allowlist." };
  }

  return { command: normalized, allowed: true, reason: null };
}

export function validateReadonlyCommands(commands: string[]): ReadonlyCommandCheck[] {
  return commands.map(validateReadonlyCommand);
}
