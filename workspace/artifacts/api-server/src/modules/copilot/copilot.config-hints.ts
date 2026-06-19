import type { CopilotConfigHint, CopilotEntity, CopilotPeerMatch } from "./copilot.types.js";

const LOCAL_ASN_PLACEHOLDER = "<ASN_LOCAL>";

function vrfFamilyBlock(vrf: string | null): string[] {
  if (!vrf) return [" ipv4-family unicast"];
  return [` ipv4-family vpn-instance ${vrf}`];
}

export function buildBgpPeerConfigHint(input: {
  peerIp: string;
  remoteAs: number | null;
  vrf: string | null;
  importPolicy?: string | null;
  exportPolicy?: string | null;
}): CopilotConfigHint {
  const remoteAs = input.remoteAs ?? "<REMOTE_AS>";
  const commands = [
    "system-view",
    `bgp ${LOCAL_ASN_PLACEHOLDER}`,
    ...vrfFamilyBlock(input.vrf),
    ` peer ${input.peerIp} as-number ${remoteAs}`,
    ` peer ${input.peerIp} enable`,
    ...(input.importPolicy ? [` peer ${input.peerIp} route-policy ${input.importPolicy} import`] : []),
    ...(input.exportPolicy ? [` peer ${input.peerIp} route-policy ${input.exportPolicy} export`] : []),
    "commit",
    "quit",
  ];

  return {
    id: `bgp-peer-${input.peerIp}`,
    title: `Sugestao: sessao BGP com ${input.peerIp}`,
    category: "bgp_peering",
    commands,
    warnings: [
      "Somente orientacao — nenhum comando e aplicado pelo copiloto.",
      "Substitua <ASN_LOCAL> pelo ASN do device (ex.: display bgp peer ou snapshot).",
      "Valide com Provisioning Preview / BGP Cleanup antes de qualquer mudanca.",
    ],
    references: ["/bgp/announcements", "/bgp/peer-drilldown", "BGP Cleanup planner"],
  };
}

export function buildPrefixAnnouncementHint(input: {
  prefix: string;
  vrf?: string | null;
  customerLabel?: string;
}): CopilotConfigHint {
  const policyName = input.customerLabel
    ? `RP_EXPORT_${input.customerLabel.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`
    : "RP_EXPORT_CLIENTE";

  return {
    id: `prefix-${input.prefix}`,
    title: `Sugestao: anunciar prefixo ${input.prefix}`,
    category: "bgp_announcements",
    commands: [
      "system-view",
      `ip ip-prefix PL_${input.prefix.replace(/\//g, "_")} index 10 permit ${input.prefix}`,
      `route-policy ${policyName} permit node 10`,
      ` if-match ip-prefix PL_${input.prefix.replace(/\//g, "_")}`,
      " apply community 65000:100 additive",
      `bgp ${LOCAL_ASN_PLACEHOLDER}`,
      ...vrfFamilyBlock(input.vrf ?? "CDN"),
      ` peer <PEER_IP> route-policy ${policyName} export`,
      "commit",
    ],
    warnings: [
      "Revise communities, filtros e upstream na matriz BGP Announcements.",
      "Confirme se o prefixo ja existe em ip-prefix / route-policy antes de criar objetos novos.",
    ],
    references: ["/bgp/announcements", "/provisioning"],
  };
}

export function buildL2CircuitHint(input: {
  circuitName: string;
  vsiName?: string | null;
  vcId?: string | null;
}): CopilotConfigHint {
  return {
    id: `l2-${input.circuitName}`,
    title: `Sugestao: circuito L2 ${input.circuitName}`,
    category: "l2_circuit",
    commands: [
      "system-view",
      ...(input.vsiName ? [`vsi ${input.vsiName}`, " pwsignal ldp", ` vsi-id ${input.vcId ?? "<VC_ID>"}`] : []),
      "interface GigabitEthernet0/0/1.<VLAN>",
      " dot1q termination vid <VLAN>",
      ...(input.vsiName ? [` l2 binding vsi ${input.vsiName}`] : [" mpls l2vc <PEER_IP> <VC_ID> tunnel-selector TS_1"]),
      "commit",
    ],
    warnings: [
      "Ajuste interface/VLAN/VC ID conforme inventario L2 e diagrama do cliente.",
      "Use discovery L2 para validar estado operacional apos mudancas.",
    ],
    references: ["/l2-circuits"],
  };
}

export function buildConfigHintsFromContext(input: {
  entities: CopilotEntity[];
  peers: CopilotPeerMatch[];
}): CopilotConfigHint[] {
  const hints: CopilotConfigHint[] = [];
  const prefix = input.entities.find((entity) => entity.kind === "prefix");
  const vrf = input.entities.find((entity) => entity.kind === "vrf");
  const customer = input.entities.find((entity) => entity.kind === "customer");
  const circuit = input.entities.find((entity) => entity.kind === "circuit");

  if (prefix) {
    hints.push(buildPrefixAnnouncementHint({
      prefix: prefix.value,
      vrf: vrf?.value ?? null,
      customerLabel: customer?.value,
    }));
  }

  for (const peer of input.peers.slice(0, 2)) {
    hints.push(buildBgpPeerConfigHint({
      peerIp: peer.peerIp,
      remoteAs: peer.remoteAs,
      vrf: peer.vrf,
      importPolicy: peer.importPolicy,
      exportPolicy: peer.exportPolicy,
    }));
  }

  if (circuit) {
    hints.push(buildL2CircuitHint({
      circuitName: circuit.label ?? circuit.value,
      vsiName: circuit.value,
    }));
  }

  const deduped = new Map<string, CopilotConfigHint>();
  for (const hint of hints) deduped.set(hint.id, hint);
  return [...deduped.values()];
}
