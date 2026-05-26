import { ChevronDown, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { BgpPeerDrilldownResult } from "./types";
import { AfiSafiBadge, DependencyStatusBadge, PolicySourceBadge } from "./bgp-drilldown-badges";

interface BgpPolicyTreeProps {
  data: BgpPeerDrilldownResult;
  direction: "import" | "export";
  title: string;
}

function TreeSection({ label, children, defaultOpen = true }: { label: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-md">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/50"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {label}
      </button>
      {open ? <div className="border-t border-border px-3 py-2 space-y-3">{children}</div> : null}
    </div>
  );
}

export function BgpPolicyTree({ data, direction, title }: BgpPolicyTreeProps) {
  const policies = data.policies.filter((p) => p.direction === direction);
  const families = data.families.filter((f) =>
    direction === "import" ? f.effectiveImportPolicy : f.effectiveExportPolicy,
  );

  if (!policies.length && !families.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma policy {direction} encontrada no snapshot para este peer.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">{title}</h4>
      {families.map((fam) => {
        const policyName = direction === "import" ? fam.effectiveImportPolicy : fam.effectiveExportPolicy;
        const policy = policies.find(
          (p) => p.afiSafi === fam.afiSafi && p.name === policyName,
        );
        const eff = data.effectivePolicies.find(
          (e) => e.afiSafi === fam.afiSafi && e.direction === direction,
        );

        return (
          <TreeSection
            key={`${fam.afiSafi}-${direction}`}
            label={(
              <span className="flex flex-wrap items-center gap-2">
                <AfiSafiBadge afi={fam.afiSafi} />
                <span className="font-mono text-xs">{policyName ?? "—"}</span>
                {eff ? <DependencyStatusBadge status={eff.status} /> : null}
                {eff ? <PolicySourceBadge source={eff.source} inherited={eff.inheritedFromGroup} /> : null}
                {fam.inheritedGroup ? (
                  <span className="text-[10px] text-muted-foreground">via {fam.inheritedGroup}</span>
                ) : null}
              </span>
            )}
          >
            {policy ? (
              policy.nodes.map((node) => (
                <div key={`${policy.name}-${node.sequence}`} className="ml-2 space-y-1">
                  <div className="text-xs text-muted-foreground">
                    node {node.sequence ?? "?"} · {node.action ?? "—"}
                  </div>
                  {node.matches.map((m) => (
                    <div key={m.raw} className="ml-4 flex flex-wrap items-center gap-2 font-mono text-xs">
                      <span className="text-muted-foreground">└──</span>
                      <span>{m.type}</span>
                      <span className="text-foreground">{m.name}</span>
                      {policy.dependencies
                        .filter((d) => d.dependencyName === m.name && d.dependencyType === m.type)
                        .map((d) => (
                          <DependencyStatusBadge key={`${d.dependencyType}-${d.dependencyName}`} status={d.status} />
                        ))}
                    </div>
                  ))}
                  {node.applies.map((a) => (
                    <div key={a.raw} className="ml-4 font-mono text-xs text-muted-foreground">
                      └── apply: {a.raw}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground ml-2">Policy não detalhada (include_policies=false ou ausente no catálogo).</p>
            )}
          </TreeSection>
        );
      })}
    </div>
  );
}
