export interface L3EvidenceSnapshot {
  hasDot1q?: boolean;
  hasIpv4?: boolean;
  hasIpv6?: boolean;
  hasIpv6Enable?: boolean;
  hasOspf?: boolean;
  hasIsis?: boolean;
  hasBgp?: boolean;
  hasRip?: boolean;
  hasVrf?: boolean;
  hasMpls?: boolean;
  hasL2Binding?: boolean;
  hasVeGroup?: boolean;
  hasBridgeDomain?: boolean;
  hasDescription?: boolean;
  hasMtu?: boolean;
  hasStatisticEnable?: boolean;
  /** Legacy alias kept for older rows */
  hasIp?: boolean;
}

export function hasL3ServiceEvidence(flags: L3EvidenceSnapshot, rawEvidence?: string | null): boolean {
  if (
    flags.hasIp ||
    flags.hasIpv4 ||
    flags.hasIpv6 ||
    flags.hasVrf ||
    flags.hasOspf ||
    flags.hasIsis ||
    flags.hasBgp ||
    flags.hasRip ||
    flags.hasMpls
  ) {
    return true;
  }

  if (flags.hasIpv6Enable && (flags.hasIpv6 || flags.hasOspf || flags.hasIsis || flags.hasBgp || flags.hasRip)) {
    return true;
  }

  const raw = rawEvidence?.trim();
  if (!raw) return false;

  return (
    /\bip address\b/i.test(raw) ||
    /\bipv6 address\b/i.test(raw) ||
    /\bip binding vpn-instance\b/i.test(raw) ||
    /\bvpn-instance\b/i.test(raw) ||
    /\bospf\b/i.test(raw) ||
    /\bisis\b/i.test(raw) ||
    /\bbgp\b/i.test(raw) ||
    /\brip\b/i.test(raw)
  );
}

export function buildL3RoleContext(flags: L3EvidenceSnapshot): string {
  return JSON.stringify({
    service_family: "l3",
    encapsulation: flags.hasDot1q ? "dot1q" : "other",
    routing: Boolean(flags.hasOspf || flags.hasIsis || flags.hasBgp || flags.hasRip),
    ipv4: Boolean(flags.hasIpv4 || flags.hasIp),
    ipv6: Boolean(flags.hasIpv6 || flags.hasIpv6Enable),
    ospf: Boolean(flags.hasOspf),
    isis: Boolean(flags.hasIsis),
    bgp: Boolean(flags.hasBgp),
    vrf: Boolean(flags.hasVrf),
  });
}
