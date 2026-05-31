import { devicesTable } from "@workspace/db";
import {
  deviceUsesConnector,
  executeViaConnector,
  type ConnectorExecutionResult,
  resolveDeviceConnectorContext,
} from "./connector-execution.service.js";

type NetconfBaseInput = {
  deviceId: number;
  credentialId?: string;
  timeoutSeconds?: number;
  createdBy?: number | null;
  port?: number;
  rpc?: string;
};

type NetconfRpcInput = NetconfBaseInput & {
  rpc: string;
};

async function loadNetconfDevice(deviceId: number) {
  const { device, connectorId } = await resolveDeviceConnectorContext(deviceId);
  if (!deviceUsesConnector(device) || !connectorId) {
    throw new Error("Device is not associated with a connector");
  }
  return { device, connectorId };
}

function normalizePort(port?: number | null): number {
  if (Number.isInteger(port) && port && port > 0) return port;
  return 830;
}

function buildNetconfPayload(input: {
  rpc: string;
  credentialId?: string;
  port: number;
  device: typeof devicesTable.$inferSelect;
}) {
  return {
    rpc: input.rpc,
    port: input.port,
    vendor: input.device.vendor,
    platform: input.device.platform,
    ...(input.credentialId ? { credential_id: input.credentialId } : {}),
  };
}

async function executeNetconfJob(
  jobType: "NETCONF_GET" | "NETCONF_GET_CONFIG" | "NETCONF_RPC",
  input: NetconfRpcInput,
  auditAction: string,
): Promise<ConnectorExecutionResult> {
  const { device, connectorId } = await loadNetconfDevice(input.deviceId);
  const port = normalizePort(input.port);

  return executeViaConnector({
    deviceId: device.id,
    connectorId,
    targetIp: device.ipAddress,
    targetPort: port,
    timeoutSeconds: input.timeoutSeconds,
    createdBy: input.createdBy,
    jobType,
    payload: buildNetconfPayload({
      rpc: input.rpc,
      credentialId: input.credentialId,
      port,
      device,
    }),
    auditAction,
    auditMetadata: {
      device_id: device.id,
      device_vendor: device.vendor,
      device_platform: device.platform,
      rpc: input.rpc,
      port,
    },
  });
}

export async function executeNetconfTest(input: NetconfBaseInput): Promise<ConnectorExecutionResult> {
  const rpc = input.rpc?.trim() || "get";
  if (rpc === "get-config") {
    return executeNetconfJob(
      "NETCONF_GET_CONFIG",
      { ...input, rpc },
      "connector_device_netconf_test",
    );
  }
  if (rpc === "get") {
    return executeNetconfJob(
      "NETCONF_GET",
      { ...input, rpc },
      "connector_device_netconf_test",
    );
  }
  return executeNetconfJob(
    "NETCONF_RPC",
    { ...input, rpc },
    "connector_device_netconf_test",
  );
}

export async function executeNetconfGetConfig(input: NetconfBaseInput): Promise<ConnectorExecutionResult> {
  return executeNetconfJob(
    "NETCONF_GET_CONFIG",
    { ...input, rpc: "get-config" },
    "connector_device_netconf_get_config",
  );
}

export async function executeNetconfRpc(input: NetconfRpcInput): Promise<ConnectorExecutionResult> {
  const rpc = input.rpc.trim();
  if (!rpc) {
    throw new Error("rpc is required");
  }
  return executeNetconfJob("NETCONF_RPC", { ...input, rpc }, "connector_device_netconf_rpc");
}
