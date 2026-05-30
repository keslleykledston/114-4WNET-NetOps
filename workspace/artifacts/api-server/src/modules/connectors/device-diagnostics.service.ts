import type { Device } from "@workspace/db";
import {
  deviceUsesConnector,
  executePing,
  executeSnmpGet,
  executeSshCommand,
  executeTcpCheck,
  resolveDeviceConnectorContext,
  type ConnectorExecutionResult,
} from "./connector-execution.service.js";
import { testSSHConnection } from "../../lib/ssh.js";
import { collectSnmpSnapshot } from "../../lib/snmp.js";

export type DeviceDiagnosticResult = {
  mode: "connector" | "direct";
  connectorId: number | null;
  ping?: ConnectorExecutionResult | { success: boolean; message: string };
  tcp22?: ConnectorExecutionResult | { success: boolean; message: string };
  snmp?: ConnectorExecutionResult | { success: boolean; message: string; sysName?: string };
  ssh?: ConnectorExecutionResult | { success: boolean; message: string; hostname?: string | null };
};

function sshVersionCommand(vendor: string): string {
  const v = vendor.toLowerCase();
  if (v.includes("huawei")) return "display version";
  if (v.includes("juniper")) return "show version";
  return "show version";
}

export async function runDeviceDiagnostics(deviceId: number): Promise<DeviceDiagnosticResult> {
  const { device, connectorId, password, community } = await resolveDeviceConnectorContext(deviceId);

  if (deviceUsesConnector(device)) {
    const [ping, tcp22, snmp, ssh] = await Promise.all([
      executePing({ deviceId, connectorId: device.connectorId, targetIp: device.ipAddress }),
      executeTcpCheck({ deviceId, connectorId: device.connectorId, targetIp: device.ipAddress, port: device.sshPort ?? 22 }),
      community
        ? executeSnmpGet({
            deviceId,
            connectorId: device.connectorId,
            targetIp: device.ipAddress,
            oid: "1.3.6.1.2.1.1.5.0",
            community,
          })
        : Promise.resolve({ success: false, stdout: "", stderr: "No SNMP community configured", exitCode: 1, resultJson: null, jobId: 0, executionMode: "connector" as const, durationMs: 0, status: "FAILED" }),
      executeSshCommand({
        deviceId,
        connectorId: device.connectorId,
        targetIp: device.ipAddress,
        username: device.username,
        password,
        command: sshVersionCommand(device.vendor),
        vendor: device.vendor,
        port: device.sshPort,
      }),
    ]);

    return {
      mode: "connector",
      connectorId: device.connectorId,
      ping,
      tcp22,
      snmp: {
        ...snmp,
        sysName: snmp.success ? snmp.stdout.trim() : undefined,
      },
      ssh: {
        ...ssh,
        hostname: ssh.success ? device.hostname : null,
      },
    };
  }

  const [sshLegacy, snmpLegacy] = await Promise.all([
    testSSHConnection({
      host: device.ipAddress,
      port: device.sshPort,
      username: device.username,
      password,
    }),
    community
      ? collectSnmpSnapshot({
          id: device.id,
          hostname: device.hostname,
          ipAddress: device.ipAddress,
          vendor: device.vendor,
          platform: device.platform,
          snmpCommunity: community,
        })
      : Promise.resolve({ success: false, errorMessage: "No SNMP community configured" }),
  ]);

  return {
    mode: "direct",
    connectorId: null,
    ssh: {
      success: sshLegacy.success,
      message: sshLegacy.message,
      hostname: sshLegacy.hostname,
    },
    snmp: {
      success: snmpLegacy.success,
      message: snmpLegacy.success ? "SNMP OK" : snmpLegacy.errorMessage ?? "SNMP failed",
      sysName: snmpLegacy.success && "sysName" in snmpLegacy ? String(snmpLegacy.sysName) : undefined,
    },
  };
}

export async function runDevicePingDiagnostic(deviceId: number) {
  const { device, password } = await resolveDeviceConnectorContext(deviceId);
  if (deviceUsesConnector(device)) {
    return executePing({ deviceId, connectorId: device.connectorId, targetIp: device.ipAddress });
  }
  const ssh = await testSSHConnection({
    host: device.ipAddress,
    port: device.sshPort,
    username: device.username,
    password,
  });
  return { success: ssh.success, message: ssh.message, mode: "direct" as const };
}
