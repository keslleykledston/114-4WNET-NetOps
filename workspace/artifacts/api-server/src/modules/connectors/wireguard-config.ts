export function buildWireGuardClientConfig(input: {
  connectorPrivateKey: string;
  connectorAddress: string;
  serverPublicKey: string;
  serverEndpoint: string;
  allowedIps: string;
  dns?: string;
}): string {
  const address = input.connectorAddress.includes("/") ? input.connectorAddress : `${input.connectorAddress}/32`;
  const lines = [
    "[Interface]",
    `PrivateKey = ${input.connectorPrivateKey}`,
    `Address = ${address}`,
  ];
  if (input.dns) {
    lines.push(`DNS = ${input.dns}`);
  }
  lines.push(
    "",
    "[Peer]",
    `PublicKey = ${input.serverPublicKey}`,
    `Endpoint = ${input.serverEndpoint}`,
    `AllowedIPs = ${input.allowedIps}`,
    "PersistentKeepalive = 25",
  );
  return `${lines.join("\n")}\n`;
}
