import type { NetopsAddressFamily } from "../types.js";

export function classifyBgpAddressFamily(peerIp: string | null | undefined): NetopsAddressFamily {
  const value = peerIp?.trim();
  if (!value) return "unknown";
  if (value.includes(":")) return "ipv6";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return "ipv4";
  return "unknown";
}
