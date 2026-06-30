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

export const fetchL2VPNStats = async (): Promise<L2VPNStats> => {
  const { data } = await axios.get<L2VPNStats>("/api/l2vpn/stats");
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
