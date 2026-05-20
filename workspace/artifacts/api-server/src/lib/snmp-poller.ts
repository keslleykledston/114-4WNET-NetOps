import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db, devicesTable, snmpSnapshotsTable } from "@workspace/db";
import { logger } from "./logger.js";
import { collectSnmpSnapshot } from "./snmp.js";

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

async function runSnmpPollCycle(): Promise<void> {
  if (running) {
    logger.warn("SNMP poll cycle skipped because previous cycle is still running");
    return;
  }

  running = true;
  try {
    const devices = await db
      .select({
        id: devicesTable.id,
        hostname: devicesTable.hostname,
        ipAddress: devicesTable.ipAddress,
        vendor: devicesTable.vendor,
        platform: devicesTable.platform,
        snmpCommunity: devicesTable.snmpCommunity,
      })
      .from(devicesTable)
      .where(and(isNotNull(devicesTable.snmpCommunity), ne(devicesTable.snmpCommunity, "")));

    for (const device of devices) {
      const snmpCommunity = device.snmpCommunity?.trim();
      if (!snmpCommunity) continue;

      const result = await collectSnmpSnapshot({
        ...device,
        snmpCommunity,
      });

      await db.insert(snmpSnapshotsTable).values({
        deviceId: device.id,
        success: result.success,
        errorMessage: result.errorMessage,
        interfacesJson: result.interfaces.length > 0 ? JSON.stringify(result.interfaces) : null,
        bgpPeersJson: result.bgpPeers.length > 0 ? JSON.stringify(result.bgpPeers) : null,
        vrfsJson: result.vrfs.length > 0 ? JSON.stringify(result.vrfs) : null,
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
