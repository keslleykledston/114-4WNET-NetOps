import type { NodeProps } from "reactflow";
import { MapPin } from "lucide-react";

export interface SiteGroupData {
  label: string;
  width: number;
  height: number;
}

export function SiteGroupNode({ data }: NodeProps<SiteGroupData>) {
  return (
    <div
      style={{ width: data.width, height: data.height }}
      className="pointer-events-none rounded-xl border border-dashed border-zinc-700/70 bg-zinc-800/15"
    >
      <div className="absolute left-3 top-2 flex items-center gap-1 rounded-md bg-zinc-900/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-300">
        <MapPin className="h-3 w-3 text-sky-400" />
        Site: {data.label}
      </div>
    </div>
  );
}