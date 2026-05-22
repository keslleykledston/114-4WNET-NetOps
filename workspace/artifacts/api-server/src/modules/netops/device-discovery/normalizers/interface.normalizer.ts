import type { InterfaceSummary } from "../discovery.types.js";
import { sourceConfidence } from "../source-priority.js";
import type { NetopsInterface } from "../../types.js";
import { isHuaweiInterfaceName } from "../../../compliance/interface-identifiers.js";

export function normalizeDiscoveryInterfaces(
  sshInterfaces: NetopsInterface[],
  snmpInterfaces: NetopsInterface[],
  cachedInterfaces: NetopsInterface[],
  localDbInterfaces: NetopsInterface[] = [],
): InterfaceSummary[] {
  const byName = new Map<string, InterfaceSummary>();

  for (const item of localDbInterfaces) {
    if (!isHuaweiInterfaceName(item.name)) continue;
    byName.set(item.name, {
      ...item,
      exists: true,
      source: "local_db",
      confidence: sourceConfidence("local_db"),
      evidence: `local interface ${item.name}`,
    });
  }

  for (const item of cachedInterfaces) {
    if (!isHuaweiInterfaceName(item.name)) continue;
    byName.set(item.name, {
      ...item,
      exists: true,
      source: "ssh_running_config",
      confidence: sourceConfidence("ssh_running_config"),
      evidence: `interface ${item.name}`,
    });
  }

  for (const item of snmpInterfaces) {
    if (!isHuaweiInterfaceName(item.name)) continue;
    const current = byName.get(item.name);
    byName.set(item.name, {
      ...(current ?? item),
      ...item,
      description: item.description ?? current?.description ?? null,
      ipv4: item.ipv4.length ? item.ipv4 : current?.ipv4 ?? [],
      ipv6: item.ipv6.length ? item.ipv6 : current?.ipv6 ?? [],
      vlan: item.vlan ?? current?.vlan ?? null,
      vrf: item.vrf ?? current?.vrf ?? null,
      exists: true,
      source: "snmp_snapshot",
      confidence: sourceConfidence("snmp_snapshot"),
      evidence: `ifName.${item.ifIndex ?? "unknown"} = ${item.name}`,
    });
  }

  for (const item of sshInterfaces) {
    if (!isHuaweiInterfaceName(item.name)) continue;
    byName.set(item.name, {
      ...item,
      exists: true,
      source: "ssh_live",
      confidence: sourceConfidence("ssh_live"),
      evidence: `interface ${item.name}`,
    });
  }

  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
}
