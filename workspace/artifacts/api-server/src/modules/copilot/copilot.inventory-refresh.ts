import { db, devicesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { collectNetopsReadOnly } from "../netops/service.js";
import { assertSnmpFastPilotDevice, OperationalPilotError } from "../operational/pilot.js";

const DEFAULT_MAX_DEVICES = 2;

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export function isCopilotInventoryRefreshEnabled(): boolean {
  return parseBoolean(process.env["NETOPS_COPILOT_INVENTORY_REFRESH_ENABLED"], false);
}

export function isSnmpRealEnabledForCopilot(): boolean {
  return process.env["NETOPS_SNMP_REAL_ENABLED"]?.trim().toLowerCase() === "true";
}

export function getCopilotInventoryRefreshConfig() {
  return {
    enabled: isCopilotInventoryRefreshEnabled(),
    snmpRealEnabled: isSnmpRealEnabledForCopilot(),
    maxDevices: Number.parseInt(process.env["NETOPS_COPILOT_INVENTORY_REFRESH_MAX_DEVICES"] ?? "", 10) || DEFAULT_MAX_DEVICES,
    readOnly: true,
  };
}

export interface CopilotInventoryRefreshResult {
  deviceId: number;
  deviceHostname: string;
  status: string;
  executed: boolean;
  bgpPeers: number;
  bgpEstablished: number;
  collectedAt: string | null;
  message: string;
  pilotAllowed: boolean;
}

export async function refreshInventoryInScope(deviceIds: number[]): Promise<{
  results: CopilotInventoryRefreshResult[];
  notes: string[];
}> {
  const config = getCopilotInventoryRefreshConfig();
  const notes: string[] = [];

  if (!config.enabled) {
    return {
      results: [],
      notes: ["Inventario refresh desabilitado (NETOPS_COPILOT_INVENTORY_REFRESH_ENABLED=false)."],
    };
  }

  if (!config.snmpRealEnabled) {
    return {
      results: [],
      notes: ["SNMP real desabilitado (NETOPS_SNMP_REAL_ENABLED=false) — inventario nao atualizado."],
    };
  }

  if (deviceIds.length === 0) {
    return { results: [], notes: ["Escopo sem devices para refresh de inventario."] };
  }

  const limitedIds = deviceIds.slice(0, config.maxDevices);
  if (deviceIds.length > limitedIds.length) {
    notes.push(`Inventario refresh limitado a ${config.maxDevices} device(s) no escopo.`);
  }

  const devices = await db
    .select({ id: devicesTable.id, hostname: devicesTable.hostname })
    .from(devicesTable)
    .where(inArray(devicesTable.id, limitedIds));

  const hostnameById = new Map(devices.map((device) => [device.id, device.hostname ?? `device-${device.id}`]));
  const results: CopilotInventoryRefreshResult[] = [];

  for (const deviceId of limitedIds) {
    const deviceHostname = hostnameById.get(deviceId) ?? `device-${deviceId}`;
    try {
      assertSnmpFastPilotDevice(deviceId);
      const collection = await collectNetopsReadOnly(deviceId);
      if (!collection) {
        results.push({
          deviceId,
          deviceHostname,
          status: "not_found",
          executed: false,
          bgpPeers: 0,
          bgpEstablished: 0,
          collectedAt: null,
          message: "Device nao encontrado.",
          pilotAllowed: true,
        });
        continue;
      }

      results.push({
        deviceId,
        deviceHostname,
        status: collection.status,
        executed: collection.executed,
        bgpPeers: collection.summary?.bgpPeers ?? 0,
        bgpEstablished: collection.summary?.bgpEstablished ?? 0,
        collectedAt: collection.collectedAt ?? null,
        message: collection.message,
        pilotAllowed: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const pilotBlocked = error instanceof OperationalPilotError;
      results.push({
        deviceId,
        deviceHostname,
        status: pilotBlocked ? "pilot_blocked" : "error",
        executed: false,
        bgpPeers: 0,
        bgpEstablished: 0,
        collectedAt: null,
        message,
        pilotAllowed: !pilotBlocked,
      });
    }
  }

  const executed = results.filter((row) => row.executed).length;
  if (executed > 0) {
    notes.push(`Inventario SNMP atualizado em ${executed} device(s).`);
  } else if (results.length > 0) {
    notes.push("Inventario refresh executado sem coleta SNMP efetiva.");
  }

  return { results, notes };
}
