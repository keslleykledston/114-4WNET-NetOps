import type { Device } from "@workspace/db";
import type { NetopsBgpPeer, NetopsCommunity, NetopsFilter, NetopsInterface, NetopsLogEntry } from "../types.js";

export type ReadonlyAdapterStatus = "idle" | "ready" | "blocked" | "error";

export interface ReadonlyCommandCheck {
  command: string;
  allowed: boolean;
  reason: string | null;
}

export interface ReadonlyAdapterLog {
  level: NetopsLogEntry["level"];
  scope: NetopsLogEntry["scope"];
  message: string;
}

export interface ReadonlyCollectionData {
  interfaces: NetopsInterface[];
  bgpPeers: NetopsBgpPeer[];
  filters: NetopsFilter[];
  communities: NetopsCommunity[];
  logs: ReadonlyAdapterLog[];
}

export interface ReadonlyCollectionResult {
  deviceId: number;
  status: ReadonlyAdapterStatus;
  executed: boolean;
  message: string;
  commandChecks: ReadonlyCommandCheck[];
  data: ReadonlyCollectionData;
}

export interface ReadonlyAdapterContext {
  device: Device;
  execute?: boolean;
}

export interface ReadonlySnmpAdapter {
  collect(context: ReadonlyAdapterContext): Promise<ReadonlyCollectionResult>;
}

export interface ReadonlySshAdapter {
  validateCommands(commands: string[]): ReadonlyCommandCheck[];
  collect(context: ReadonlyAdapterContext, commands: string[]): Promise<ReadonlyCollectionResult>;
}
