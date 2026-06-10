import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db, devicesTable, snmpSnapshotsTable, type Device } from "@workspace/db";
import { logger } from "./logger.js";
import { collectSnmpSnapshot, type SnmpCollectionResult } from "./snmp.js";
import { collectSnmpReadonlyViaConnector } from "../modules/connectors/connector-snmp-collect.js";
import { deviceUsesConnector } from "../modules/connectors/connector-execution.service.js";
import type { SnmpReadonlyCollectPayload } from "../modules/netops/snmp/types.js";
import { snapshotToNetopsData } from "../modules/netops/adapters/snapshot-adapter.js";
import { recordBgpPeerRemovalHistory } from "../modules/netops/service.js";
import { getLatestSnmpCollectorSnapshot } from "../modules/netops/snmp/snapshot-queries.js";

const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;

let started = false;
let running = false;

export function startSnmpPoller(): void {
  if (started) return;
  started = true;

  const enabled = process.env["SNMP_POLL_ENABLED"] !== "false";
  if (!enabled) {
    logger.info("SNMP poller disabled");
    return;
  }

  const intervalMs = Number(process.env["SNMP_POLL_INTERVAL_MS"] ?? DEFAULT_POLL_INTERVAL_MS);
  const pollIntervalMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_POLL_INTERVAL_MS;

  logger.info({ pollIntervalMs }, "SNMP poller started");

  setTimeout(() => {
    void runSnmpPollCycle();
  }, 15_000);

  setInterval(() => {
    void runSnmpPollCycle();
  }, pollIntervalMs);
}

function mapReadonlyPayloadToCollectionResult(payload: SnmpReadonlyCollectPayload): SnmpCollectionResult {
  return {
    success: payload.success,
    errorMessage: payload.errorMessage,
    interfaces: payload.interfaces.map((iface) => ({
      index: String(iface.ifIndex),
      name: iface.name,
      description: iface.description,
      alias: iface.alias,
      adminStatus: iface.adminStatus,
      operStatus: iface.operStatus,
      speedBps: iface.speed,
      vrfName: null,
    })),
    bgpPeers: payload.bgpPeers.map((peer) => ({
      peerKey: `${peer.peerIp}|${peer.addressFamily}|${peer.vrf ?? ""}`,
      remoteAddress: peer.peerIp,
      remoteAs: peer.remoteAs,
      state: peer.state,
      vrfName: peer.vrf ?? null,
    })),
    vrfs: [],
  };
}

async function collectSnmpSnapshotForDevice(device: Device, snmpCommunity: string): Promise<SnmpCollectionResult> {
  if (deviceUsesConnector(device)) {
    const payload = await collectSnmpReadonlyViaConnector(device, snmpCommunity);
    return mapReadonlyPayloadToCollectionResult(payload);
  }
  return collectSnmpSnapshot({
    id: device.id,
    hostname: device.hostname,
    ipAddress: device.ipAddress,
    vendor: device.vendor,
    platform: device.platform,
    snmpCommunity,
  });
}

async function runSnmpPollCycle(): Promise<void> {
  if (running) {
    logger.warn("SNMP poll cycle skipped because previous cycle is still running");
    return;
  }

  running = true;
  try {
    const devices = await db
      .select()
      .from(devicesTable)
      .where(and(isNotNull(devicesTable.snmpCommunity), ne(devicesTable.snmpCommunity, "")));

    for (const device of devices) {
      const snmpCommunity = device.snmpCommunity?.trim();
      if (!snmpCommunity) continue;

      const previousSnapshot = await getLatestSnmpCollectorSnapshot(device.id);
      const previousBgpPeers = previousSnapshot ? snapshotToNetopsData(previousSnapshot).bgpPeers : [];

      const result = await collectSnmpSnapshotForDevice(device, snmpCommunity);

      const [snapshotRow] = await db.insert(snmpSnapshotsTable).values({
        deviceId: device.id,
        success: result.success,
        errorMessage: result.errorMessage,
        interfacesJson: result.interfaces.length > 0 ? JSON.stringify(result.interfaces) : null,
        bgpPeersJson: result.bgpPeers.length > 0 ? JSON.stringify(result.bgpPeers) : null,
        vrfsJson: result.vrfs.length > 0 ? JSON.stringify(result.vrfs) : null,
      }).returning({ id: snmpSnapshotsTable.id });

      const [insertedSnapshot] = await db
        .select()
        .from(snmpSnapshotsTable)
        .where(eq(snmpSnapshotsTable.id, snapshotRow.id))
        .limit(1);
      const currentBgpPeers = snapshotToNetopsData(insertedSnapshot ?? null).bgpPeers;

      const removedCount = await recordBgpPeerRemovalHistory({
        deviceId: device.id,
        collector: "snmp_poller",
        previousSnapshotId: previousSnapshot?.id ?? null,
        currentSnapshotId: snapshotRow?.id ?? null,
        previousPeers: previousBgpPeers,
        currentPeers: currentBgpPeers,
      });

      if (result.success) {
        await db.update(devicesTable)
          .set({
            lastSeen: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(devicesTable.id, device.id));
      }

      logger.info(
        {
          deviceId: device.id,
          hostname: device.hostname,
          success: result.success,
          interfaces: result.interfaces.length,
          bgpPeers: result.bgpPeers.length,
          vrfs: result.vrfs.length,
          removedBgpPeers: removedCount,
        },
        "SNMP poll finished",
      );
    }
  } catch (error) {
    logger.error({ err: error }, "SNMP poll cycle failed");
  } finally {
    running = false;
  }
}
