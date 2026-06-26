import { useEffect, useRef, useState } from "react";

interface Props {
  seed: number;
  baselineMbps: number;   // ~ utilization-based
  capacityMbps: number;
  /** When set, renders real SNMP-derived samples instead of mock noise. */
  liveSeries?: { tx: number[]; rx: number[] };
}

/**
 * Tiny TX/RX sparkline. Uses inline SVG (no external chart lib). Two lines: TX (sky), RX (emerald).
 */
export function PortMiniChart({ seed, baselineMbps, capacityMbps, liveSeries }: Props) {
  const [series, setSeries] = useState<{ tx: number[]; rx: number[] }>(() => {
    if (liveSeries?.tx.length) return liveSeries;
    const r = mulberry32(seed);
    const tx: number[] = [];
    const rx: number[] = [];
    let txV = baselineMbps;
    let rxV = baselineMbps * 0.8;
    for (let i = 0; i < 40; i++) {
      txV = clamp(txV + (r() - 0.5) * baselineMbps * 0.25, 0, capacityMbps);
      rxV = clamp(rxV + (r() - 0.5) * baselineMbps * 0.25, 0, capacityMbps);
      tx.push(txV);
      rx.push(rxV);
    }
    return { tx, rx };
  });
  const rRef = useRef(mulberry32(seed + 999));

  useEffect(() => {
    if (liveSeries?.tx.length) {
      setSeries(liveSeries);
    }
  }, [liveSeries]);

  useEffect(() => {
    if (liveSeries) return;
    const id = setInterval(() => {
      setSeries((prev) => {
        const r = rRef.current;
        const lastTx = prev.tx[prev.tx.length - 1] ?? baselineMbps;
        const lastRx = prev.rx[prev.rx.length - 1] ?? baselineMbps;
        const nextTx = clamp(lastTx + (r() - 0.5) * baselineMbps * 0.3, 0, capacityMbps);
        const nextRx = clamp(lastRx + (r() - 0.5) * baselineMbps * 0.3, 0, capacityMbps);
        return {
          tx: [...prev.tx.slice(1), nextTx],
          rx: [...prev.rx.slice(1), nextRx],
        };
      });
    }, 1500);
    return () => clearInterval(id);
  }, [baselineMbps, capacityMbps, liveSeries]);

  const W = 220;
  const H = 60;
  const max = Math.max(capacityMbps, ...series.tx, ...series.rx, 1);
  const toPath = (arr: number[]) =>
    arr
      .map((v, i) => {
        const x = (i / (arr.length - 1)) * W;
        const y = H - (v / max) * H;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  const txCur = series.tx[series.tx.length - 1] ?? 0;
  const rxCur = series.rx[series.rx.length - 1] ?? 0;

  return (
    <div>
      <svg width={W} height={H} className="block">
        <rect x={0} y={0} width={W} height={H} fill="#09090b" rx={4} />
        {/* grid */}
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={0} x2={W} y1={H * g} y2={H * g} stroke="#1f2937" strokeWidth={0.5} />
        ))}
        <path d={toPath(series.rx)} fill="none" stroke="#10b981" strokeWidth={1.4} />
        <path d={toPath(series.tx)} fill="none" stroke="#38bdf8" strokeWidth={1.4} />
      </svg>
      <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-400" /> TX{" "}
          <span className="text-zinc-200">{fmt(txCur)}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" /> RX{" "}
          <span className="text-zinc-200">{fmt(rxCur)}</span>
        </span>
        <span className="text-zinc-500">cap {fmt(capacityMbps)}</span>
      </div>
    </div>
  );
}

function fmt(mbps: number) {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
  return `${mbps.toFixed(0)} Mbps`;
}
function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}