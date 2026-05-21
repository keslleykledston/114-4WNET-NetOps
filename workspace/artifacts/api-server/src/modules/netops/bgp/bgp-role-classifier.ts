import type { NetopsBgpRole } from "../types.js";

const PROVIDER_PATTERNS = /\b(upstream|operadora|carrier|transit|provider|link-|ebt|claro|vivo|telefonica|algar|embratel)\b/i;
const CUSTOMER_PATTERNS = /\b(cliente|customer|client|cust)\b/i;
const CDN_PATTERNS = /\b(cdn|google|akamai|meta|facebook|netflix|cloudflare)\b/i;
const IX_PATTERNS = /\b(ix|pix|ptt|ixp)\b/i;

export function classifyBgpPeer(input: {
  remoteAs: number | null;
  localAs?: number | null;
  description?: string | null;
  peerIp?: string | null;
  importPolicy?: string | null;
  exportPolicy?: string | null;
}): NetopsBgpRole {
  if (input.localAs != null && input.remoteAs != null && input.localAs === input.remoteAs) {
    return "ibgp";
  }

  const text = [
    input.description,
    input.peerIp,
    input.importPolicy,
    input.exportPolicy,
  ].filter(Boolean).join(" ");

  const looksCdn = CDN_PATTERNS.test(text);
  const looksIx = IX_PATTERNS.test(text);
  if (looksCdn && looksIx) return "cdn_ix";
  if (looksCdn) return "cdn";
  if (looksIx) return "ix";
  if (CUSTOMER_PATTERNS.test(text)) return "customer";
  if (PROVIDER_PATTERNS.test(text)) return "provider";

  return "unknown";
}
