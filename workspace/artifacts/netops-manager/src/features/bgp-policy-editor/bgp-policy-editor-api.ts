import type {
  BgpPolicyEditorBackendPreviewResponse,
  BgpPolicyEditorPreviewRequest,
} from "./bgp-policy-editor.types";

export class BgpPolicyEditorPreviewApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "BgpPolicyEditorPreviewApiError";
    this.status = status;
    this.code = code;
  }
}

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new BgpPolicyEditorPreviewApiError(
      body.message ?? body.error ?? `Preview failed (${response.status})`,
      response.status,
      body.error,
    );
  }
  return response.json() as Promise<T>;
}

export async function fetchBgpPolicyEditorPreview(
  deviceId: number,
  peer: string,
  request: BgpPolicyEditorPreviewRequest,
): Promise<BgpPolicyEditorBackendPreviewResponse> {
  return fetchJson<BgpPolicyEditorBackendPreviewResponse>(
    `/api/bgp/peers/${deviceId}/${encodeURIComponent(peer)}/policy-editor/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
}
