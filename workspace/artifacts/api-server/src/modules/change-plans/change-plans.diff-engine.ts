import type { ChangeDiffItem, ChangeDiffResult, ChangeDiffStatus } from "./change-plans.types.js";

function itemKey(type: string, name: string): string {
  return `${type}::${name}`;
}

function asMap(items: Array<{ type: string; name: string; payload?: unknown }>): Map<string, { type: string; name: string; payload?: unknown }> {
  const map = new Map<string, { type: string; name: string; payload?: unknown }>();
  for (const item of items) {
    map.set(itemKey(item.type, item.name), item);
  }
  return map;
}

function flattenState(state: Record<string, unknown[]>): Array<{ type: string; name: string; payload?: unknown }> {
  const rows: Array<{ type: string; name: string; payload?: unknown }> = [];
  for (const [type, entries] of Object.entries(state)) {
    for (const entry of entries) {
      if (entry && typeof entry === "object" && "name" in entry) {
        const record = entry as { name: string; [key: string]: unknown };
        rows.push({ type, name: String(record.name), payload: record });
        continue;
      }
      if (typeof entry === "string") {
        rows.push({ type, name: entry });
      }
    }
  }
  return rows;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function classifyDiff(before?: unknown, after?: unknown): ChangeDiffStatus {
  if (before === undefined && after !== undefined) return "ADDED";
  if (before !== undefined && after === undefined) return "REMOVED";
  if (stableJson(before) === stableJson(after)) return "UNCHANGED";
  return "CHANGED";
}

export function computeChangeDiff(input: {
  beforeState: Record<string, unknown[]>;
  afterState: Record<string, unknown[]>;
}): ChangeDiffResult {
  const beforeItems = flattenState(input.beforeState);
  const afterItems = flattenState(input.afterState);
  const beforeMap = asMap(beforeItems);
  const afterMap = asMap(afterItems);
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  const added: ChangeDiffItem[] = [];
  const removed: ChangeDiffItem[] = [];
  const changed: ChangeDiffItem[] = [];
  const unchanged: ChangeDiffItem[] = [];

  for (const key of keys) {
    const before = beforeMap.get(key);
    const after = afterMap.get(key);
    const status = classifyDiff(before?.payload ?? before, after?.payload ?? after);
    const entry: ChangeDiffItem = {
      key,
      type: after?.type ?? before?.type ?? "unknown",
      name: after?.name ?? before?.name ?? key,
      status,
      before: before?.payload ?? before,
      after: after?.payload ?? after,
    };
    switch (status) {
      case "ADDED":
        added.push(entry);
        break;
      case "REMOVED":
        removed.push(entry);
        break;
      case "CHANGED":
        changed.push(entry);
        break;
      default:
        unchanged.push(entry);
        break;
    }
  }

  const sortByName = (left: ChangeDiffItem, right: ChangeDiffItem) =>
    `${left.type}:${left.name}`.localeCompare(`${right.type}:${right.name}`);

  added.sort(sortByName);
  removed.sort(sortByName);
  changed.sort(sortByName);
  unchanged.sort(sortByName);

  return {
    added,
    removed,
    changed,
    unchanged,
    summary: {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      unchanged: unchanged.length,
    },
  };
}

export function summarizeDiffForMarkdown(diff: ChangeDiffResult): string[] {
  const lines: string[] = [];
  for (const bucket of ["added", "removed", "changed", "unchanged"] as const) {
    const label = bucket.toUpperCase();
    const items = diff[bucket];
    lines.push(`## ${label}`);
    if (!items.length) {
      lines.push("- none");
      continue;
    }
    for (const item of items) {
      lines.push(`- ${item.type} ${item.name}`);
    }
    lines.push("");
  }
  return lines;
}
