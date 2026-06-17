import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db, devicesTable } from "@workspace/db";
import { logger } from "./logger.js";
import { collectOperationalBgpPeers } from "../modules/operational-bgp/operational-bgp.service.js";
import { getSnmpFastPilotDeviceIds, isSnmpFastPilotAllowlistEnforced } from "../modules/operational/pilot.js";
import { isNetopsSnmpBgpRealEnabled } from "../modules/operational-bgp/operational-bgp.gate.js";

const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;

let started = false;
let running = false;

export function startOperationalBgpPoller(): void {
  if (started) return;
  started = true;

  if (!isNetopsSnmpBgpRealEnabled()) {
    logger.info("Operational BGP poller disabled");
    return;
  }

  const intervalMs = Number(process.env["SNMP_FAST_BGP_POLL_INTERVAL_MS"] ?? DEFAULT_POLL_INTERVAL_MS);
  const pollIntervalMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_POLL_INTERVAL_MS;

  logger.info({ pollIntervalMs }, "Operational BGP poller started");

  setTimeout(() => {
    void runPollCycle();
  }, 20_000);

  setInterval(() => {
    void runPollCycle();
  }, pollIntervalMs);
}

async function runPollCycle(): Promise<void> {
  if (running) {
    logger.warn("Operational BGP poll cycle skipped because previous cycle is still running");
    return;
  }

  running = true;
  try {
    const allowlistedIds = isSnmpFastPilotAllowlistEnforced() ? [...getSnmpFastPilotDeviceIds()] : [];
    const filters = [
      isNotNull(devicesTable.snmpCommunity),
      ne(devicesTable.snmpCommunity, ""),
      ...(allowlistedIds.length > 0 ? [inArray(devicesTable.id, allowlistedIds)] : []),
    ];
    const devices = await db
      .select({
        id: devicesTable.id,
        hostname: devicesTable.hostname,
        ipAddress: devicesTable.ipAddress,
        snmpCommunity: devicesTable.snmpCommunity,
      })
      .from(devicesTable)
      .where(and(...filters));

    for (const device of devices) {
      const snmpCommunity = device.snmpCommunity?.trim();
      if (!snmpCommunity) continue;

      try {
        const result = await collectOperationalBgpPeers(device.id, "system:poller");
        logger.info(
          {
            deviceId: device.id,
            hostname: device.hostname,
            peerCount: result.peerCount,
            status: result.status,
            freshness: result.freshness,
          },
          "Operational BGP poll finished",
        );
      } catch (error) {
        logger.warn(
          {
            deviceId: device.id,
            hostname: device.hostname,
            err: error,
          },
          "Operational BGP poll failed",
        );
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Operational BGP poll cycle failed");
  } finally {
    running = false;
  }
}
