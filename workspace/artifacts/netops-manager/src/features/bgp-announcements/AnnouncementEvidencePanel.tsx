import { Badge } from "@/components/ui/badge";
import type { TargetEvidence } from "./announcement-types";

interface AnnouncementEvidencePanelProps {
  evidence: TargetEvidence | null;
  loading?: boolean;
}

export function AnnouncementEvidencePanel({ evidence, loading }: AnnouncementEvidencePanelProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card/40 p-4 text-[12px] text-muted-foreground">
        Carregando evidência…
      </div>
    );
  }

  if (!evidence) {
    return (
      <div className="rounded-lg border border-border bg-card/40 p-4 text-[12px] text-muted-foreground">
        Selecione uma célula da matriz para ver evidência detalhada.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 text-[12px]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-semibold text-foreground">Evidência</span>
        <Badge variant="outline">{evidence.upstreamName}</Badge>
        <Badge variant="secondary">{evidence.detectedState}</Badge>
        <Badge variant="outline" className="capitalize">{evidence.policyClass.replace(/_/g, " ")}</Badge>
        {evidence.modifiable ? (
          <Badge className="bg-emerald-500/20 text-emerald-300">Modificável</Badge>
        ) : (
          <Badge className="bg-red-500/20 text-red-300">Audit-only</Badge>
        )}
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <Field label="Target policy" value={evidence.routePolicyName} mono />
        <Field label="Node" value={String(evidence.node)} />
        <Field label="Upstream / circuit" value={`${evidence.upstreamName} (C${evidence.upstreamCircuitId})`} />
        <Field label="Community" value={evidence.community ?? "—"} mono />
        <Field label="Action code" value={evidence.actionCode ?? "—"} />
        <Field label="Fonte" value={evidence.source} />
        <Field label="Última coleta" value={evidence.lastCollectedAt ? new Date(evidence.lastCollectedAt).toLocaleString() : "—"} />
        <Field label="Idade (min)" value={evidence.collectionAgeMinutes != null ? String(evidence.collectionAgeMinutes) : "—"} />
        <Field label="Community-list" value={evidence.communityListName ?? "—"} mono />
        <Field label="Confiança" value={evidence.confidence} />
      </div>

      <div className="mt-3">
        <div className="text-[11px] text-muted-foreground">Communities resolvidas</div>
        <div className="mt-1 font-mono text-[10px] text-primary">{evidence.communitiesDirect.join(" ") || "—"}</div>
      </div>

      <div className="mt-3">
        <div className="text-[11px] text-muted-foreground">Prefixos afetados ({evidence.prefixesAffected.length})</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {evidence.prefixesAffected.map((p) => (
            <Badge key={p} variant="secondary" className="font-mono text-[10px]">{p}</Badge>
          ))}
        </div>
      </div>

      {evidence.rawApplies.length > 0 ? (
        <div className="mt-3">
          <div className="text-[11px] text-muted-foreground">Apply lines (observado)</div>
          <pre className="mt-1 max-h-28 overflow-auto rounded bg-black/30 p-2 font-mono text-[10px] text-emerald-100">
            {evidence.rawApplies.join("\n")}
          </pre>
        </div>
      ) : null}

      {evidence.findings.length > 0 ? (
        <div className="mt-3 space-y-1">
          {evidence.findings.map((f) => (
            <div key={f.code} className="text-[11px] text-amber-200/90">[{f.severity}] {f.message}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono text-[11px] text-foreground" : "text-[11px] text-foreground"}>{value}</div>
    </div>
  );
}
