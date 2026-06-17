import { desc, eq } from "drizzle-orm";
import { collectedConfigsTable, db } from "@workspace/db";
import type { DeviceDiscoverySnapshot } from "../netops/device-discovery/discovery.types.js";
import { parseHuaweiPolicyDependencyPipeline } from "../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";

export function isReliableLocalAs(value: number | null | undefined): value is number {
  return value != null && Number.isInteger(value) && value > 0 && value !== 23456;
}

export function parseLocalAsFromBgpConfigText(configText: string): number | null {
  const trimmed = (configText ?? "").trim();
  if (!trimmed) return null;

  const parsed = parseHuaweiPolicyDependencyPipeline(trimmed, "ssh_running_config").bgp_peer_model?.localAs ?? null;
  if (isReliableLocalAs(parsed)) return parsed;

  const match = trimmed.replace(/\r/g, "").match(/^bgp\s+(\d+)\s*$/im);
  if (!match) return null;
  const asn = Number(match[1]);
  return isReliableLocalAs(asn) ? asn : null;
}

export function localAsFromVrfRd(snapshot: DeviceDiscoverySnapshot): number | null {
  for (const vrf of snapshot.vrfs ?? []) {
    const rd = vrf.rd?.trim();
    if (!rd) continue;
    const match = /^(\d+):\d+$/.exec(rd);
    if (!match) continue;
    const asn = Number(match[1]);
    if (isReliableLocalAs(asn)) return asn;
  }
  return null;
}

export function localAsFromSnapshot(snapshot: DeviceDiscoverySnapshot): number | null {
  const fromModel = snapshot.parsed_config?.bgp_peer_model?.localAs ?? null;
  if (isReliableLocalAs(fromModel)) return fromModel;
  return localAsFromVrfRd(snapshot);
}

export async function localAsFromCollectedConfigs(deviceId: number): Promise<number | null> {
  const rows = await db
    .select({ rawConfig: collectedConfigsTable.rawConfig })
    .from(collectedConfigsTable)
    .where(eq(collectedConfigsTable.deviceId, deviceId))
    .orderBy(desc(collectedConfigsTable.collectedAt))
    .limit(25);

  for (const row of rows) {
    const asn = parseLocalAsFromBgpConfigText(row.rawConfig ?? "");
    if (asn) return asn;
  }
  return null;
}

export async function resolveLocalAsForCleanup(input: {
  deviceId: number;
  snapshot: DeviceDiscoverySnapshot;
  liveLocalAs?: number | null;
  rawBgpConfig?: string | null;
  collectedConfigLookup?: (deviceId: number) => Promise<number | null>;
}): Promise<{ localAs: number | null; source: string | null; warnings: string[] }> {
  const warnings: string[] = [];
  const lookup = input.collectedConfigLookup ?? localAsFromCollectedConfigs;

  if (isReliableLocalAs(input.liveLocalAs)) {
    return { localAs: input.liveLocalAs, source: "live", warnings };
  }

  const fromSnapshot = localAsFromSnapshot(input.snapshot);
  if (fromSnapshot) {
    const source = input.snapshot.parsed_config?.bgp_peer_model?.localAs != null
      ? "snapshot_bgp_model"
      : "snapshot_vrf_rd";
    if (source === "snapshot_vrf_rd") {
      warnings.push("Local AS inferido do RD das VRFs do snapshot.");
    }
    return { localAs: fromSnapshot, source, warnings };
  }

  if (input.rawBgpConfig) {
    const fromRaw = parseLocalAsFromBgpConfigText(input.rawBgpConfig);
    if (fromRaw) {
      return { localAs: fromRaw, source: "raw_bgp_config", warnings };
    }
  }

  const fromCollected = await lookup(input.deviceId);
  if (fromCollected) {
    warnings.push("Local AS inferido de collected_configs BGP em cache.");
    return { localAs: fromCollected, source: "collected_config", warnings };
  }

  warnings.push("Local AS não identificado; script usa placeholder bgp <ASN>.");
  return { localAs: null, source: null, warnings };
}
