import type { LiveTrafficSample } from "@/features/network-map/operational-interfaces-api";
import { formatMbps } from "@/features/network-map/operational-interfaces-api";
import { useTranslation } from "@/i18n";

interface Props {
  series: LiveTrafficSample[];
  capacityMbps: number;
  txMbps: number | null;
  rxMbps: number | null;
}

/** Real-time TX/RX sparkline from SNMP counter deltas (no synthetic data). */
export function LiveTrafficChart({ series, capacityMbps, txMbps, rxMbps }: Props) {
  const { t } = useTranslation();
  const W = 280;
  const H = 72;
  const max = Math.max(capacityMbps, ...series.flatMap((s) => [s.tx, s.rx]), txMbps ?? 0, rxMbps ?? 0, 1);

  const toPath = (key: "tx" | "rx") => {
    if (series.length < 2) return "";
    return series
      .map((point, i) => {
        const x = (i / (series.length - 1)) * W;
        const y = H - (point[key] / max) * H;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  };

  return (
    <div>
      <svg width={W} height={H} className="block w-full">
        <rect x={0} y={0} width={W} height={H} fill="#09090b" rx={4} />
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={0} x2={W} y1={H * g} y2={H * g} stroke="#1f2937" strokeWidth={0.5} />
        ))}
        {series.length >= 2 && (
          <>
            <path d={toPath("rx")} fill="none" stroke="#10b981" strokeWidth={1.5} />
            <path d={toPath("tx")} fill="none" stroke="#38bdf8" strokeWidth={1.5} />
          </>
        )}
        {series.length < 2 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fill="#71717a" fontSize={10}>
            {t("networkMap.liveTraffic.waitingSecondSample")}
          </text>
        )}
      </svg>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />
          TX <span className="text-zinc-200">{formatMbps(txMbps)}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          RX <span className="text-zinc-200">{formatMbps(rxMbps)}</span>
        </span>
        <span className="text-zinc-500">{t("networkMap.liveTraffic.capacity", { value: formatMbps(capacityMbps) })}</span>
      </div>
    </div>
  );
}
