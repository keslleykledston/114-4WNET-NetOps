import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ArrowDown, ArrowUp, Edit3, GitCompare } from "lucide-react";

export function DiffDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-zinc-100">
            <GitCompare className="h-4 w-4" /> Comparar snapshots
          </SheetTitle>
          <SheetDescription className="text-zinc-400">
            Diff entre o snapshot atual e o anterior.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          <Section title="Links adicionados" color="emerald" icon={<ArrowUp className="h-3.5 w-3.5" />}
            items={["MNS-RB → MCH-RA (10G)"]} />
          <Section title="Links removidos" color="red" icon={<ArrowDown className="h-3.5 w-3.5" />}
            items={["BVA-RB → CJB-RA (legado)"]} />
          <Section title="Links alterados" color="amber" icon={<Edit3 className="h-3.5 w-3.5" />}
            items={["BVA-RA ↔ BVA-RB (UP → PARTIAL)"]} />
          <Section title="Devices não vistos" color="zinc" icon={<ArrowDown className="h-3.5 w-3.5" />}
            items={["4WNET-CJB-RA-S6730"]} />
          <Section title="Status alterados" color="amber" icon={<Edit3 className="h-3.5 w-3.5" />}
            items={["DWDM-BVA-01 (UP → PARTIAL)"]} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title, items, color, icon,
}: { title: string; items: string[]; color: "emerald"|"red"|"amber"|"zinc"; icon: React.ReactNode }) {
  const cm: Record<string, string> = {
    emerald: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    red: "text-red-400 border-red-500/30 bg-red-500/10",
    amber: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    zinc: "text-zinc-300 border-zinc-700 bg-zinc-800/40",
  };
  return (
    <div>
      <div className={`mb-1.5 inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] ${cm[color]}`}>
        {icon}{title}
      </div>
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i} className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2 text-xs text-zinc-200">{i}</li>
        ))}
      </ul>
    </div>
  );
}