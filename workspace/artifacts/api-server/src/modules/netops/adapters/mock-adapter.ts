import type { NetopsBgpPeer, NetopsCommunity, NetopsFilter, NetopsInterface } from "../types.js";

export function emptyInterfaces(): NetopsInterface[] {
  return [];
}

export function emptyBgpPeers(): NetopsBgpPeer[] {
  return [];
}

export function emptyFilters(): NetopsFilter[] {
  return [];
}

export function emptyCommunities(): NetopsCommunity[] {
  return [];
}
