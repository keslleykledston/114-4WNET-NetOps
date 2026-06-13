import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AnnouncementCell } from "./AnnouncementCell";
import type { MatrixRow } from "./announcement-types";

interface AnnouncementMatrixTableProps {
  rows: MatrixRow[];
  upstreams: Array<{ circuitId: string; displayName: string }>;
  onCellClick?: (row: MatrixRow, circuitId: string) => void;
}

export function AnnouncementMatrixTable({ rows, upstreams, onCellClick }: AnnouncementMatrixTableProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
        Nenhum target de ORIGIN/Import encontrado. Execute discovery com policies BGP no device.
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-lg border border-border">
      <table className="w-full min-w-[960px] text-left text-[12px]">
        <thead className="sticky top-0 z-10 bg-[#121826] text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-3 py-2 font-medium">Target Policy</th>
            <th className="px-2 py-2 font-medium">Análise</th>
            <th className="px-2 py-2 font-medium">Fam.</th>
            <th className="px-2 py-2 font-medium">Prefix scope</th>
            {upstreams.map((u) => (
              <th key={u.circuitId} className="px-2 py-2 font-medium text-center">
                {u.displayName}
              </th>
            ))}
            <th className="px-2 py-2 font-medium">Risco</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isOpen = expanded[row.targetKey] ?? false;
            return (
              <Fragment key={row.targetKey}>
                <tr className="border-b border-border/60 hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-left font-mono text-[11px] text-primary"
                      onClick={() => setExpanded((s) => ({ ...s, [row.targetKey]: !isOpen }))}
                    >
                      {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      {row.routePolicyName}
                      <span className="text-muted-foreground">#{row.node}</span>
                    </button>
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">
                    {row.targetType === "origin" ? "Origin" : row.targetType === "customer" ? "Import" : "—"}
                  </td>
                  <td className="px-2 py-2 uppercase text-muted-foreground">{row.family}</td>
                  <td className="px-2 py-2 font-mono text-[11px]">{row.prefixScope}</td>
                  {upstreams.map((u) => {
                    const cell = row.cells.find((c) => c.circuitId === u.circuitId);
                    return (
                      <td key={`${row.targetKey}-${u.circuitId}`} className="px-2 py-2 text-center">
                        <AnnouncementCell
                          label={cell?.label ?? "—"}
                          community={cell?.community}
                          disabled={!row.modifiable}
                          onClick={cell && row.modifiable ? () => onCellClick?.(row, u.circuitId) : undefined}
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-2">
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {row.riskLevel}
                    </Badge>
                  </td>
                </tr>
                {isOpen ? (
                  <tr className="border-b border-border/40 bg-muted/10">
                    <td colSpan={5 + upstreams.length} className="px-6 py-3">
                      <div className="space-y-2 text-[11px] text-muted-foreground">
                        {row.prefixListName ? (
                          <div>
                            <span className="text-foreground">Prefix-list:</span> {row.prefixListName}
                          </div>
                        ) : null}
                        <div>
                          <span className="text-foreground">Prefixos afetados ({row.affectedPrefixes.length}):</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {row.affectedPrefixes.map((p) => (
                              <Badge key={p} variant="secondary" className="font-mono text-[10px]">
                                {p}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {row.findings.length > 0 ? (
                          <div className="space-y-1">
                            {row.findings.map((f) => (
                              <div key={f.code} className="text-amber-200/90">
                                [{f.severity}] {f.message}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
