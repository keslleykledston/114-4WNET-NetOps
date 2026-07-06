import { useEffect, useRef, useState } from "react";
import type { LivePortMetrics } from "@/components/network-map/device-stencils/stencils";
import {
  ApiHttpError,
  capacityMbpsFromInterface,
  computeTrafficMbps,
  counterSample,
  ensureSnmpFastCollect,
  fetchOperationalInterfaces,
  SNMP_FAST_POLL_MS,
  type OperationalInterfaceDto,
} from "./network-map-api";

export type LiveTrafficSample = { tx: number; rx: number; at: number };

export function formatMbps(mbps: number | null | undefined): string {
  if (mbps == null || mbps <= 0) return "—";
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
  return `${mbps.toFixed(1)} Mbps`;
}

function utilPctFromTraffic(txMbps: number, rxMbps: number, capacityMbps: number): number {
  if (capacityMbps <= 0) return 0;
  return Math.min(100, Math.round((Math.max(txMbps, rxMbps) / capacityMbps) * 100));
}

function metricsFromOperational(
  iface: OperationalInterfaceDto,
  utilPct: number,
): LivePortMetrics {
  const oper = iface.operStatus?.toLowerCase();
  const admin = iface.adminStatus?.toLowerCase();
  return {
    operStatus: oper === "up" || oper === "down" ? oper : "unknown",
    adminStatus: admin === "up" || admin === "down" ? admin : "unknown",
    description: iface.ifAlias ?? iface.ifDescr ?? null,
    speedMbps: capacityMbpsFromInterface(iface),
    utilPct,
  };
}

/**
 * Poll operational IF-MIB counters and return per-interface status + utilization.
 */
export function useLiveInterfaceTraffic(deviceId: number | null, enabled: boolean) {
  const [livePorts, setLivePorts] = useState<Map<string, LivePortMetrics>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevRef = useRef<Map<string, { inOctets: bigint; outOctets: bigint; at: number }>>(new Map());

  useEffect(() => {
    if (!enabled || deviceId == null) {
      prevRef.current = new Map();
      setLivePorts(new Map());
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    prevRef.current = new Map();
    setLoading(true);

    const tick = async () => {
      try {
        await ensureSnmpFastCollect(deviceId);

        const payload = await fetchOperationalInterfaces(deviceId);
        if (cancelled) return;

        const next = new Map<string, LivePortMetrics>();
        for (const iface of payload.interfaces) {
          const sample = iface.hcInOctets && iface.hcOutOctets ? counterSample(iface) : null;
          const prev = sample ? prevRef.current.get(iface.ifName) ?? null : null;
          let utilPct = 0;
          if (sample && prev) {
            const { txMbps, rxMbps } = computeTrafficMbps(prev, sample);
            utilPct = utilPctFromTraffic(txMbps, rxMbps, capacityMbpsFromInterface(iface));
          }
          if (sample) prevRef.current.set(iface.ifName, sample);
          next.set(iface.ifName, metricsFromOperational(iface, utilPct));
        }

        setLivePorts(next);
        setLoading(false);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setLoading(false);
        if (err instanceof ApiHttpError && (err.status === 502 || err.status === 503)) {
          setError(err.message);
          return;
        }
        setError(err instanceof Error ? err.message : "Falha ao coletar SNMP");
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), SNMP_FAST_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [deviceId, enabled]);

  return { livePorts, loading, error };
}
