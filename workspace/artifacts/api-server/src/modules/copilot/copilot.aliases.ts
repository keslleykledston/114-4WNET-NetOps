/** Known provider / customer aliases for intent resolution (read-only inventory). */
export interface ProviderAlias {
  id: string;
  displayName: string;
  keywords: string[];
  vrf?: string;
  roles?: string[];
  remoteAs?: number[];
}

export const PROVIDER_ALIASES: ProviderAlias[] = [
  {
    id: "google",
    displayName: "Google",
    keywords: ["google", "gcp", "youtube", "googlecdn"],
    vrf: "CDN",
    roles: ["cdn", "cdn_ix"],
    remoteAs: [15169, 36040, 139190, 16550],
  },
  {
    id: "meta",
    displayName: "Meta/Facebook",
    keywords: ["meta", "facebook", "fb"],
    vrf: "CDN",
    roles: ["cdn", "cdn_ix"],
    remoteAs: [32934, 54115],
  },
  {
    id: "netflix",
    displayName: "Netflix",
    keywords: ["netflix", "nflx"],
    vrf: "CDN",
    roles: ["cdn"],
    remoteAs: [2906],
  },
  {
    id: "akamai",
    displayName: "Akamai",
    keywords: ["akamai"],
    vrf: "CDN",
    roles: ["cdn"],
    remoteAs: [20940, 16625],
  },
  {
    id: "cloudflare",
    displayName: "Cloudflare",
    keywords: ["cloudflare"],
    vrf: "CDN",
    roles: ["cdn"],
    remoteAs: [13335],
  },
];

export function resolveProviderAlias(text: string): ProviderAlias | null {
  const normalized = text.toLowerCase();
  for (const alias of PROVIDER_ALIASES) {
    if (alias.keywords.some((keyword) => normalized.includes(keyword))) {
      return alias;
    }
  }
  return null;
}
