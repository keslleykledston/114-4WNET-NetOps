import { access, readFile } from "node:fs/promises";
import path from "node:path";

export const repoRoot = process.cwd();

export function resolveRepoPath(...parts) {
  return path.join(repoRoot, ...parts);
}

export async function readRepoFile(...parts) {
  return readFile(resolveRepoPath(...parts), "utf8");
}

export async function fileExists(...parts) {
  try {
    await access(resolveRepoPath(...parts));
    return true;
  } catch {
    return false;
  }
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function assertIncludes(text, needle, message) {
  assert(text.includes(needle), message ?? `Missing expected text: ${needle}`);
}

export function assertAllIncludes(text, needles, label) {
  for (const needle of needles) {
    assertIncludes(text, needle, `${label}: missing ${needle}`);
  }
}

