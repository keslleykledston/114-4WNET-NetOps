import { env } from "../../lib/env.js";

export class NetBoxError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "NetBoxError";
    this.statusCode = statusCode;
  }
}

export type NetBoxFetchResult<T> = {
  data: T;
  status: number;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function buildUrl(baseUrl: string, path: string, params?: Record<string, string | number | boolean | undefined | null>) {
  const url = new URL(path.replace(/^\//, ""), `${normalizeBaseUrl(baseUrl)}/`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function fetchJson<T>(url: URL, init: RequestInit & { timeoutMs?: number; skipTlsVerify?: boolean }) {
  const controller = new AbortController();
  const timeoutMs = init.timeoutMs ?? env.netboxTimeoutMs;
  const timer = setTimeout(() => controller.abort(new Error(`NetBox request timed out after ${timeoutMs}ms`)), timeoutMs);
  const originalTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;

  if (init.skipTlsVerify) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!response.ok) {
      const message = typeof data === "object" && data && "detail" in data
        ? String((data as { detail?: unknown }).detail ?? "NetBox request failed")
        : `NetBox request failed with status ${response.status}`;
      throw new NetBoxError(message, response.status);
    }
    return { data: data as T, status: response.status };
  } catch (error) {
    if (error instanceof NetBoxError) throw error;
    const message = error instanceof Error ? error.message : "NetBox request failed";
    throw new NetBoxError(message, 502);
  } finally {
    clearTimeout(timer);
    if (init.skipTlsVerify) {
      if (originalTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTls;
    }
  }
}

export async function netboxFetch<T>(
  baseUrl: string,
  token: string,
  path: string,
  init: RequestInit & { timeoutMs?: number; skipTlsVerify?: boolean } = {},
): Promise<NetBoxFetchResult<T>> {
  const url = buildUrl(baseUrl, path, undefined);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Token ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  return fetchJson<T>(url, { ...init, headers });
}

export async function netboxPaginate<T>(
  baseUrl: string,
  token: string,
  path: string,
  params: Record<string, string | number | boolean | undefined | null> = {},
  options: { timeoutMs?: number; skipTlsVerify?: boolean } = {},
): Promise<{ count: number; next: string | null; previous: string | null; items: T[] }> {
  const url = buildUrl(baseUrl, path, params);
  const { data } = await netboxFetch<{ count?: number; next?: string | null; previous?: string | null; results?: T[] }>(
    baseUrl,
    token,
    url.pathname + url.search,
    options,
  );

  return {
    count: data.count ?? (data.results?.length ?? 0),
    next: data.next ?? null,
    previous: data.previous ?? null,
    items: data.results ?? [],
  };
}
