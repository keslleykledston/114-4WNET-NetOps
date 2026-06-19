import { accessSync, constants as fsConstants } from "node:fs";
import { dirname, resolve } from "node:path";

export type SystemUpdateChannel = "stable" | "staging" | "nightly";
export type SystemUpdateRiskLevel = "low" | "medium" | "high";
export type SystemUpdateStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "rolled_back"
  | "rollback_failed"
  | "aborted";

export type SystemUpdateStepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export const SYSTEM_UPDATE_STEP_NAMES = [
  "precheck",
  "backup",
  "git_fetch",
  "checkout_target",
  "build_backend",
  "build_frontend",
  "tests",
  "migrations",
  "restart",
  "healthcheck",
  "validation",
  "finalize",
] as const;

export type SystemUpdateStepName = (typeof SYSTEM_UPDATE_STEP_NAMES)[number];

const SENSITIVE_ENV_PATTERN = /(password|secret|token|authorization|cookie|session|github_token|gh_token|node_auth_token|database_url|snmpcommunity|community|private_key|client_secret|api_key|access_key|refresh_token)/i;
const SENSITIVE_LINE_PATTERN = /(password|secret|token|authorization|cookie|session|github_token|gh_token|node_auth_token|database_url|snmpcommunity|community|private_key|client_secret|api_key|access_key|refresh_token)\s*[:=]/i;
const SHARED_HEAVY_PATH_PATTERNS = [
  /workspace\/lib\/db\/migrations\//i,
  /workspace\/lib\/db\/src\/schema\//i,
  /workspace\/artifacts\/api-server\/src\/routes\//i,
  /workspace\/artifacts\/api-server\/src\/modules\/system-update\//i,
  /workspace\/artifacts\/netops-manager\/src\/pages\//i,
  /workspace\/artifacts\/netops-manager\/src\/components\//i,
  /docker-compose\.yml$/i,
  /\.env(\.example)?$/i,
  /package\.json$/i,
];

export function sanitizeShellOutput(input: string, maxLength = 4000): string {
  const redacted = input
    .split("\n")
    .map((line) => {
      if (SENSITIVE_LINE_PATTERN.test(line) || SENSITIVE_ENV_PATTERN.test(line)) {
        return line.replace(/[:=].*$/, ": [redacted]");
      }
      return line;
    })
    .join("\n")
    .replace(/(postgres(?:ql)?:\/\/)([^@\s]+)@/gi, "$1[redacted]@")
    .replace(/(mysql:\/\/)([^@\s]+)@/gi, "$1[redacted]@")
    .replace(/(https?:\/\/)([^:\s]+):([^@\s]+)@/gi, "$1[redacted]:[redacted]@")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/(DATABASE_URL|PGPASSWORD|GITHUB_TOKEN|SYSTEM_UPDATE_GITHUB_TOKEN|GH_TOKEN|NODE_AUTH_TOKEN|AUTH_TOKEN|SESSION_SECRET|CLIENT_SECRET|API_KEY|ACCESS_KEY|REFRESH_TOKEN)\s*=\s*[^ \n]+/gi, "$1=[redacted]");

  return redacted.length > maxLength ? `${redacted.slice(0, maxLength)}…` : redacted;
}

export function isSystemUpdateChannel(value: string): value is SystemUpdateChannel {
  return value === "stable" || value === "staging" || value === "nightly";
}

export function parseSystemUpdateChannel(value: unknown, fallback: SystemUpdateChannel): SystemUpdateChannel {
  if (typeof value !== "string") return fallback;
  return isSystemUpdateChannel(value) ? value : fallback;
}

export function classifyImpactFile(filePath: string): "high" | "medium" | "low" {
  if (SHARED_HEAVY_PATH_PATTERNS.some((pattern) => pattern.test(filePath))) return "high";
  if (/(routes|modules|pages|schema|migrations)/i.test(filePath)) return "medium";
  return "low";
}

export function estimateRiskLevel(files: string[]): SystemUpdateRiskLevel {
  if (files.length === 0) return "low";
  if (files.some((file) => classifyImpactFile(file) === "high")) return "high";
  if (files.length > 12 || files.some((file) => classifyImpactFile(file) === "medium")) return "medium";
  return "low";
}

export function summarizeImpact(files: string[]): Array<{ path: string; impact: "high" | "medium" | "low" }> {
  return files.slice(0, 30).map((path) => ({ path, impact: classifyImpactFile(path) }));
}

export function formatVersionLabel(version: string | null | undefined, commit: string, tag?: string | null) {
  const shortCommit = commit.slice(0, 8);
  if (tag && tag.trim()) return `${tag.trim()} (${shortCommit})`;
  if (version && version.trim()) return `${version.trim()} (${shortCommit})`;
  return shortCommit;
}

export function parseGitRemoteUrl(remoteUrl: string | null | undefined): string | null {
  if (!remoteUrl) return null;
  const sshMatch = remoteUrl.match(/^git@github\.com:([^/]+\/[^/.]+)(?:\.git)?$/i);
  if (sshMatch?.[1]) return sshMatch[1];
  const httpsMatch = remoteUrl.match(/^https?:\/\/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/i);
  if (httpsMatch?.[1]) return httpsMatch[1];
  return null;
}

export function findRepoRoot(startDir: string): string {
  let current = resolve(startDir);
  while (true) {
    try {
      accessSync(resolve(current, "docker-compose.yml"), fsConstants.F_OK);
      accessSync(resolve(current, "workspace"), fsConstants.F_OK);
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) return resolve(startDir);
      current = parent;
    }
  }
}
