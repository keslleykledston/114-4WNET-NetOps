import axios from "axios";
import { useQuery } from "@tanstack/react-query";

export type L2VPNStats = {
  total: number;
  up: number;
  degraded: number;
  down: number;
  circuits: Array<{
    id: string;
    type: "L2VC" | "VSI";
    siteA: string;
    siteB: string;
    status: "UP" | "DEGRADED" | "DOWN";
  }>;
};

export type L2VPNCircuit = {
  id: number;
  deviceId: number;
  device: string;
  site: string;
  name: string;
  type: "L2VC" | "VSI";
  circuitType: string;
  status: "UP" | "DEGRADED" | "DOWN";
  description?: string | null;
  outerVlan?: number | null;
  innerVlan?: number | null;
  vcId?: string | null;
  vsiName?: string | null;
  vsiId?: string | null;
  localInterface?: string | null;
  parentInterface?: string | null;
  peerIp?: string | null;
  findings?: Array<{ code: string; severity: string; message: string }>;
};

export type L2VPNComparison = {
  status: "PASS" | "WARN" | "BLOCKER";
  left: {
    id: number;
    deviceId: number;
    device: string;
    site: string;
    name: string;
    type: "L2VC" | "VSI";
    status: "UP" | "DEGRADED" | "DOWN";
  };
  right: {
    id: number;
    deviceId: number;
    device: string;
    site: string;
    name: string;
    type: "L2VC" | "VSI";
    status: "UP" | "DEGRADED" | "DOWN";
  };
  diffs: Array<{
    field: string;
    left: unknown;
    right: unknown;
    match: boolean;
  }>;
  recommendedAction: string;
};

export type L2VPNDraftResponse = {
  id: number | null;
  status: string;
  title: string;
  circuitIds: number[];
  notes: string;
};

export const fetchL2VPNStats = async (): Promise<L2VPNStats> => {
  const { data } = await axios.get<L2VPNStats>("/api/l2vpn/stats");
  return data;
};

export const fetchL2VPNCircuits = async (): Promise<{ total: number; circuits: L2VPNCircuit[] }> => {
  const { data } = await axios.get<{ total: number; circuits: L2VPNCircuit[] }>("/api/l2vpn/circuits");
  return data;
};

export const compareL2VPNCircuits = async (leftCircuitId: number, rightCircuitId: number): Promise<L2VPNComparison> => {
  const { data } = await axios.post<L2VPNComparison>("/api/l2vpn/validate", { leftCircuitId, rightCircuitId });
  return data;
};

export const createL2VPNDraft = async (payload: { title: string; circuitIds: number[]; notes?: string; validation?: unknown }): Promise<L2VPNDraftResponse> => {
  const { data } = await axios.post<L2VPNDraftResponse>("/api/l2vpn/drafts", payload);
  return data;
};

export const useL2VPNStats = () => {
  return useQuery({
    queryKey: ["l2vpn-stats"],
    queryFn: fetchL2VPNStats,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

export const useL2VPNCircuits = () => {
  return useQuery({
    queryKey: ["l2vpn-circuits"],
    queryFn: fetchL2VPNCircuits,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
