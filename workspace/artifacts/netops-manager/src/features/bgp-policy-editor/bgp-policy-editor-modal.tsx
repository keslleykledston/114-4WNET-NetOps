import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Copy, Save, Settings2, ShieldAlert, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { BgpPeerContextCard } from "@/features/bgp/bgp-peer-context-card";
import type {
  BgpPolicyEditorBackendPreviewResponse,
  BgpPolicyEditorCommunityEditPayload,
  BgpPolicyEditorModalProps,
  BgpPolicyEditorPolicy,
  BgpPolicyEditorPolicyNode,
  BgpPolicyEditorPendingEdit,
  BgpPolicyEditorPreview,
  BgpPolicyEditorPreviewRequest,
  BgpPolicyEditorPreviewSource,
} from "./bgp-policy-editor.types";
import {
  buildCommunityOptions,
  buildCommunitySetOptions,
  buildNodeKey,
  buildNodePreviewText,
  buildBackendPreviewUnavailableFinding,
  buildPolicyEditorPreviewRequest,
  buildPolicyEditorPreview,
  comparePreviewSummaries,
  extractAppliedCommunities,
  extractCommunityListFromMatches,
  extractCommunityRefs,
  getImportPolicies,
  nodeHasMeaningfulChange,
  buildPreviewDriftFinding,
  summariseNode,
} from "./bgp-policy-editor.utils";
import {
  BgpPolicyEditorPreviewApiError,
  fetchBgpPolicyEditorPreview,
} from "./bgp-policy-editor-api";
import {
  BGP_POLICY_EDITOR_PREVIEW_EVENTS,
  classifyPreviewBackendError,
  emitBgpPolicyEditorPreviewEvent,
} from "./bgp-policy-editor-observability";
import { BgpCommunityEditorModal } from "./bgp-community-editor-modal";

interface PolicyNodeCardProps {
  policy: BgpPolicyEditorPolicy;
  node: BgpPolicyEditorPolicyNode;
  index: number;
  expanded: boolean;
  pendingEdit?: BgpPolicyEditorPendingEdit;
  onToggle: () => void;
  onEditCommunity: () => void;
}

function PolicyNodeCard({
  policy,
  node,
  index,
  expanded,
  pendingEdit,
  onToggle,
  onEditCommunity,
}: PolicyNodeCardProps) {
  const currentList = extractCommunityListFromMatches(node.matches);
  const originalCommunities = extractAppliedCommunities(node);
  const effectiveCommunities = pendingEdit?.selectedCommunities ?? originalCommunities;
  const changed = pendingEdit?.changed ?? nodeHasMeaningfulChange(originalCommunities, effectiveCommunities);

  return (
    <div className={cn("rounded-md border border-border bg-muted/10", changed && "border-amber-500/40 bg-amber-500/5")}>
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left"
        onClick={onToggle}
      >
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">node {node.sequence ?? index + 1}</Badge>
            <Badge variant="outline">{node.action ?? "—"}</Badge>
            <Badge variant="outline">{policy.afiSafi}</Badge>
            {changed ? <Badge variant="destructive">Alteração pendente</Badge> : null}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>if-match: {node.matches.length ? node.matches.map((match) => `${match.type} ${match.name}`).join(" | ") : "—"}</span>
            <span>apply: {node.applies.length ? node.applies.map((apply) => apply.raw).join(" | ") : "—"}</span>
          </div>
        </div>
        <div className="pt-1 text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-border px-3 py-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">community-list: {currentList ?? "—"}</Badge>
            <Badge variant="outline">community refs: {extractCommunityRefs(node.matches).length}</Badge>
            <Badge variant="outline">dependencies: {policy.dependencies.filter((dep) => dep.fromNode === node.sequence).length}</Badge>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Raw config reconstruído</div>
              <Textarea readOnly value={summariseNode(node)} className="min-h-32 font-mono text-xs" />
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dependencies / warnings</div>
              <div className="space-y-2 rounded-md border border-border bg-background/40 p-3 text-xs">
                {policy.dependencies.filter((dep) => dep.fromNode === node.sequence).length ? (
                  policy.dependencies
                    .filter((dep) => dep.fromNode === node.sequence)
                    .map((dep) => (
                      <div key={`${dep.dependencyType}-${dep.dependencyName}-${dep.fromNode}`} className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{dep.dependencyType}</Badge>
                        <span className="font-mono">{dep.dependencyName}</span>
                        <Badge variant="outline">{dep.status}</Badge>
                        <span className="text-muted-foreground">{dep.evidence}</span>
                      </div>
                    ))
                ) : (
                  <p className="text-muted-foreground">Sem dependências específicas do node detectadas.</p>
                )}
                {node.matches.length === 0 || node.applies.length === 0 ? (
                  <Alert className="border-amber-500/30 bg-amber-500/5">
                    <ShieldAlert className="h-4 w-4 text-amber-400" />
                    <AlertTitle>Dados incompletos</AlertTitle>
                    <AlertDescription>
                      Nem todos os campos do node estão disponíveis no snapshot. O shell usa apenas o material já coletado.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              A edição de community é apenas local nesta fase.
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onEditCommunity}>
              <Settings2 className="h-4 w-4 mr-2" />
              Editar community
            </Button>
          </div>

          {pendingEdit ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Antes</div>
                <pre className="overflow-auto rounded-md border border-border bg-background/50 p-3 text-xs whitespace-pre-wrap">
                  {summariseNode(node)}
                </pre>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Depois</div>
                <pre className="overflow-auto rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs whitespace-pre-wrap">
                  {pendingEdit.previewText}
                </pre>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function BgpPolicyEditorModal({
  open,
  onOpenChange,
  deviceId,
  deviceName,
  peerIp,
  peerRemoteAs,
  peerVrf,
  drilldown,
  communityLibraryItems,
  communitySets,
}: BgpPolicyEditorModalProps) {
  const importPolicies = useMemo(() => getImportPolicies(drilldown ?? null), [drilldown]);
  const communityOptions = useMemo(
    () => buildCommunityOptions(communityLibraryItems ?? null),
    [communityLibraryItems],
  );
  const communitySetOptions = useMemo(
    () => buildCommunitySetOptions(communitySets ?? null),
    [communitySets],
  );
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [pendingEdits, setPendingEdits] = useState<Record<string, BgpPolicyEditorPendingEdit>>({});
  const [previewRevision, setPreviewRevision] = useState(0);
  const [lastPreviewAt, setLastPreviewAt] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSource, setPreviewSource] = useState<BgpPolicyEditorPreviewSource>("local");
  const [backendPreview, setBackendPreview] = useState<BgpPolicyEditorBackendPreviewResponse | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [driftDetected, setDriftDetected] = useState(false);
  const [driftSummary, setDriftSummary] = useState<string[]>([]);
  const [communityEditorOpen, setCommunityEditorOpen] = useState(false);
  const [communityNode, setCommunityNode] = useState<{
    key: string;
    policy: BgpPolicyEditorPolicy;
    node: BgpPolicyEditorPolicyNode;
  } | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setExpandedNodes({});
      setPendingEdits({});
      setPreviewRevision(0);
      setLastPreviewAt(null);
      setPreviewLoading(false);
      setPreviewSource("local");
      setBackendPreview(null);
      setBackendError(null);
      setDriftDetected(false);
      setDriftSummary([]);
      setCommunityEditorOpen(false);
      setCommunityNode(null);
      setCloseConfirmOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setPreviewSource("local");
    setBackendPreview(null);
    setBackendError(null);
    setDriftDetected(false);
    setDriftSummary([]);
    setLastPreviewAt(null);
  }, [communitySetOptions, drilldown, open, pendingEdits]);

  function openCommunityEditor(policy: BgpPolicyEditorPolicy, node: BgpPolicyEditorPolicyNode, index: number) {
    const key = buildNodeKey(policy.name, node.sequence, index);
    setCommunityNode({ key, policy, node });
    setCommunityEditorOpen(true);
  }

  function saveCommunityEdit(payload: BgpPolicyEditorCommunityEditPayload) {
    if (!communityNode) return;
    setPendingEdits((current) => ({
      ...current,
      [payload.key]: {
        key: payload.key,
        policyName: payload.policyName,
        afiSafi: payload.afiSafi,
        sequence: payload.sequence,
        original: communityNode.node,
        selectedCommunities: payload.normalizedCommunities,
        matchedCommunityListName: payload.matchedCommunityListName,
        isCustom: payload.isCustom,
        confidence: payload.confidence,
        changed: payload.changed,
        previewText: buildNodePreviewText(
          communityNode.node,
          payload.normalizedCommunities,
          payload.matchedCommunityListName,
          payload.isCustom,
          payload.confidence,
        ),
      },
    }));
    setExpandedNodes((current) => ({ ...current, [payload.key]: true }));
    setLastPreviewAt(new Date().toISOString());
  }

  function handleCloseAttempt(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (Object.keys(pendingEdits).length > 0) {
      setCloseConfirmOpen(true);
      return;
    }
    onOpenChange(false);
  }

  function discardAndClose() {
    setPendingEdits({});
    setCloseConfirmOpen(false);
    onOpenChange(false);
  }

  function continueEditing() {
    setCloseConfirmOpen(false);
  }

  async function triggerPreview() {
    setPreviewRevision((value) => value + 1);
    setPreviewSource("local");
    setBackendPreview(null);
    setBackendError(null);
    setDriftDetected(false);
    setDriftSummary([]);
    setPreviewLoading(true);
    setLastPreviewAt(new Date().toISOString());

    const request: BgpPolicyEditorPreviewRequest = buildPolicyEditorPreviewRequest({
      routePolicyName: importPolicies[0]?.name ?? null,
      pendingEdits: Object.fromEntries(
        Object.entries(pendingEdits).map(([key, edit]) => [key, { key, selectedCommunities: edit.selectedCommunities }]),
      ),
    });

    const localSnapshot = buildPolicyEditorPreview({
      deviceId,
      deviceName,
      peerIp,
      peerRemoteAs: peerRemoteAs ?? null,
      peerVrf: peerVrf ?? null,
      drilldown,
      communitySets: communitySetOptions,
      pendingEdits,
    });
    const safeRoutePolicyName = request.routePolicyName ?? null;
    const previewEventBase = {
      timestamp: new Date().toISOString(),
      deviceId,
      peer: peerIp,
      routePolicyName: safeRoutePolicyName,
      findings: localSnapshot.findings.map((finding) => finding.code),
    } as const;

    emitBgpPolicyEditorPreviewEvent({
      event: BGP_POLICY_EDITOR_PREVIEW_EVENTS.LOCAL_USED,
      previewSource: "local",
      driftDetected: false,
      ...previewEventBase,
    });

    try {
      const backend = await fetchBgpPolicyEditorPreview(deviceId, peerIp, request);
      const drift = comparePreviewSummaries(localSnapshot, backend);
      setBackendPreview(backend);
      setBackendError(null);
      setDriftDetected(drift.driftDetected);
      setDriftSummary(drift.driftSummary);
      setPreviewSource("backend");
      emitBgpPolicyEditorPreviewEvent({
        event: BGP_POLICY_EDITOR_PREVIEW_EVENTS.BACKEND_SUCCESS,
        timestamp: new Date().toISOString(),
        deviceId,
        peer: peerIp,
        routePolicyName: safeRoutePolicyName,
        previewSource: "backend",
        driftDetected: drift.driftDetected,
        findings: backend.findings.map((finding) => finding.code),
        backendStatus: "success",
      });
      if (drift.driftDetected) {
        emitBgpPolicyEditorPreviewEvent({
          event: BGP_POLICY_EDITOR_PREVIEW_EVENTS.DRIFT_DETECTED,
          timestamp: new Date().toISOString(),
          deviceId,
          peer: peerIp,
          routePolicyName: safeRoutePolicyName,
          previewSource: "backend",
          driftDetected: true,
          findings: backend.findings.map((finding) => finding.code),
          backendStatus: "success",
        });
      }
    } catch (error) {
      const message = error instanceof BgpPolicyEditorPreviewApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Backend preview unavailable";
      const backendErrorKind = error instanceof BgpPolicyEditorPreviewApiError
        ? "http"
        : classifyPreviewBackendError(message);
      setBackendPreview(null);
      setBackendError(message);
      setDriftDetected(false);
      setDriftSummary([]);
      setPreviewSource("local_fallback");
      emitBgpPolicyEditorPreviewEvent({
        event: BGP_POLICY_EDITOR_PREVIEW_EVENTS.BACKEND_FAILED,
        timestamp: new Date().toISOString(),
        deviceId,
        peer: peerIp,
        routePolicyName: safeRoutePolicyName,
        previewSource: "local_fallback",
        driftDetected: false,
        findings: localSnapshot.findings.map((finding) => finding.code),
        backendStatus: "failed",
        backendErrorKind,
      });
      emitBgpPolicyEditorPreviewEvent({
        event: BGP_POLICY_EDITOR_PREVIEW_EVENTS.LOCAL_FALLBACK_USED,
        timestamp: new Date().toISOString(),
        deviceId,
        peer: peerIp,
        routePolicyName: safeRoutePolicyName,
        previewSource: "local_fallback",
        driftDetected: false,
        findings: localSnapshot.findings.map((finding) => finding.code),
        backendStatus: "fallback",
        backendErrorKind,
      });
    } finally {
      setPreviewLoading(false);
    }
  }

  const summaryCounts = useMemo(() => {
    const changed = Object.values(pendingEdits).filter((item) => item.changed).length;
    const customs = Object.values(pendingEdits).filter((item) => item.isCustom).length;
    return { changed, customs };
  }, [pendingEdits]);

  const localPreview = useMemo(
    () => buildPolicyEditorPreview({
      deviceId,
      deviceName,
      peerIp,
      peerRemoteAs: peerRemoteAs ?? null,
      peerVrf: peerVrf ?? null,
      drilldown,
      communitySets: communitySetOptions,
      pendingEdits,
    }),
    [communitySetOptions, deviceId, deviceName, drilldown, peerIp, peerRemoteAs, peerVrf, pendingEdits, previewRevision],
  );

  const previewView = useMemo<BgpPolicyEditorPreview>(() => {
    const basePreview = backendPreview ?? localPreview;
    const findings = [...basePreview.findings];
    if (backendError) {
      findings.unshift(buildBackendPreviewUnavailableFinding(`Preview backend indisponível: ${backendError}`));
    }
    if (driftDetected) {
      findings.unshift(buildPreviewDriftFinding(driftSummary));
    }
    return {
      ...basePreview,
      findings,
      previewSource,
      backendError,
      driftDetected,
      driftSummary,
    };
  }, [backendError, backendPreview, driftDetected, driftSummary, localPreview, previewSource]);

  const activePolicyCount = importPolicies.length;
  const activeNodeCount = importPolicies.reduce((total, policy) => total + policy.nodes.length, 0);
  const changedNodeCount = previewView.nodeEdits.filter((item) => item.changed).length;
  const previewBadgeLabel = previewView.previewSource === "backend"
    ? "Preview backend"
    : previewView.previewSource === "local_fallback"
      ? "Preview local fallback"
      : "Preview local";

  return (
    <>
      <Dialog open={open} onOpenChange={handleCloseAttempt}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Editor de Policy de Importação</DialogTitle>
            <DialogDescription>
              {deviceName} · peer {peerIp} · {peerRemoteAs ?? "AS—"}{peerVrf ? ` · VRF ${peerVrf}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert className="border-amber-500/30 bg-amber-500/5">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <AlertTitle>Shell read-only / local-state</AlertTitle>
              <AlertDescription>
                Apply real desabilitado nesta fase. Esta edição é apenas local/read-only.
              </AlertDescription>
            </Alert>

            <BgpPeerContextCard
              device={{
                id: deviceId,
                hostname: deviceName,
                ipAddress: "",
                vendor: "",
                platform: "",
                sshPort: 22,
                username: "",
                site: "",
                status: "active",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              } as never}
              peer={{
                peerIp,
                remoteAs: peerRemoteAs ?? null,
                vrf: peerVrf ?? null,
                role: "customer",
                state: "Established",
                roleSource: "manual_override",
                addressFamily: "ipv4",
                sessionType: "ebgp",
                importPolicy: importPolicies[0]?.name ?? null,
                exportPolicy: drilldown?.effectivePolicies.find((policy) => policy.direction === "export")?.policyName ?? null,
                source: "snapshot",
              } as never}
              drilldownHref={`/bgp/peer-drilldown?deviceId=${deviceId}&peer=${encodeURIComponent(peerIp)}&auto=1`}
              netopsHref={`/netops-operations?deviceId=${deviceId}`}
              operationalHref={`/operational/bgp?deviceId=${deviceId}`}
              className="bg-background/40"
            />

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">policies: {activePolicyCount}</Badge>
              <Badge variant="outline">nodes: {activeNodeCount}</Badge>
              <Badge variant="outline">pending: {changedNodeCount}</Badge>
              <Badge variant="outline">custom: {summaryCounts.customs}</Badge>
              <Badge variant="outline">preview rev {previewRevision}</Badge>
              {lastPreviewAt ? <Badge variant="outline">preview {new Date(lastPreviewAt).toLocaleString()}</Badge> : null}
              <Badge variant="outline">{previewBadgeLabel}</Badge>
              {previewLoading ? <Badge variant="outline">Gerando preview</Badge> : null}
              <Badge variant="outline">{previewView.safety.applyDisabled ? "Apply desabilitado" : "Apply liberado"}</Badge>
              <Badge variant="outline">{previewView.safety.rollbackDisabled ? "Rollback desabilitado" : "Rollback liberado"}</Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border border-border bg-background/60 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Origem do último preview</div>
                <div className="mt-1 text-sm font-medium">{previewBadgeLabel}</div>
              </div>
              <div className="rounded-md border border-border bg-background/60 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Drift detectado</div>
                <div className="mt-1 text-sm font-medium">{previewView.driftDetected ? "Sim" : "Não"}</div>
              </div>
              <div className="rounded-md border border-border bg-background/60 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Último erro backend</div>
                <div className="mt-1 break-words text-sm font-medium">{previewView.backendError ?? "—"}</div>
              </div>
              <div className="rounded-md border border-border bg-background/60 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Safety</div>
                <div className="mt-1 text-sm font-medium">dry-run · apply off · rollback off</div>
              </div>
            </div>

            {importPolicies.length > 0 ? (
              <div className="space-y-3">
                {importPolicies.map((policy) => (
                  <div key={`${policy.name}-${policy.afiSafi}`} className="rounded-md border border-border bg-muted/10">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2">
                      <div>
                        <div className="text-sm font-semibold">{policy.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {policy.afiSafi} · {policy.dependencies.length} dependencies · {policy.status}
                        </div>
                      </div>
                      <Badge variant="outline">{previewBadgeLabel}</Badge>
                    </div>
                    <ScrollArea className="max-h-[34rem]">
                      <div className="space-y-3 p-3">
                        {policy.nodes.map((node, index) => {
                          const key = buildNodeKey(policy.name, node.sequence, index);
                          const isExpanded = expandedNodes[key] ?? false;
                          const pendingEdit = pendingEdits[key];
                          return (
                            <PolicyNodeCard
                              key={key}
                              policy={policy}
                              node={node}
                              index={index}
                              expanded={isExpanded}
                              pendingEdit={pendingEdit}
                              onToggle={() => setExpandedNodes((current) => ({ ...current, [key]: !isExpanded }))}
                              onEditCommunity={() => openCommunityEditor(policy, node, index)}
                            />
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                ))}
              </div>
            ) : (
              <Alert>
                <AlertTitle>Sem route-policy import detalhada</AlertTitle>
                <AlertDescription>
                  O snapshot atual não trouxe policies de import para este peer. O shell continua read-only.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-3 rounded-md border border-border bg-muted/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Preview normalizado</div>
                  <div className="text-xs text-muted-foreground">
                    Combinação de communities ordenada, deduplicada e comparada contra community-lists existentes.
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{previewView.routePolicyName}</Badge>
                  <Badge variant="outline">{previewBadgeLabel}</Badge>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-md border border-border bg-background/60 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Findings</div>
                  <div className="mt-2 space-y-2">
                    {previewView.findings.map((finding) => (
                      <div key={`${finding.code}-${finding.message}`} className="rounded-md border border-border px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={finding.severity === "error" ? "destructive" : "outline"}>{finding.code}</Badge>
                          <Badge variant="outline">{finding.severity}</Badge>
                          {finding.blocking ? <Badge variant="destructive">blocking</Badge> : <Badge variant="outline">non-blocking</Badge>}
                        </div>
                        <div className="mt-2 text-sm">{finding.message}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{finding.recommendation}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Safety</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {previewView.safety.messages.map((message) => (
                      <Badge key={message} variant="outline">
                        {message}
                      </Badge>
                    ))}
                    <Badge variant="outline">{previewView.safety.dryRun ? "Dry-run" : "Live"}</Badge>
                  </div>
                  <div className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">Aggregate diff</div>
                  <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">{previewView.diff.summary}</pre>
                  <div className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">Community resolution</div>
                  <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">
                    {previewView.nodeEdits.length
                      ? previewView.nodeEdits
                          .map((item) => `${item.nodeId}: ${item.matchedCommunityListName ?? "Customizado"} (${item.isCustom ? "custom" : "matched"})`)
                          .join("\n")
                      : "Nenhum node disponível"}
                  </pre>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Diff por node</div>
                <div className="space-y-2">
                  {previewView.nodeEdits.map((node) => (
                    <div key={node.nodeId} className={cn("rounded-md border px-3 py-2", node.changed ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-background/60")}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{node.nodeId}</Badge>
                        <Badge variant="outline">{node.action ?? "—"}</Badge>
                        <Badge variant="outline">{node.matchedCommunityListName ?? "Customizado"}</Badge>
                        {node.changed ? <Badge variant="destructive">changed</Badge> : <Badge variant="outline">unchanged</Badge>}
                        {node.unsupportedReason ? <Badge variant="destructive">{node.unsupportedReason}</Badge> : null}
                      </div>
                      <div className="mt-2 grid gap-2 lg:grid-cols-2">
                        <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded border border-border bg-background/80 p-2 text-xs">
                          {node.diff.beforeLines.join("\n")}
                        </pre>
                        <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs">
                          {node.diff.afterLines.join("\n")}
                        </pre>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">{node.diff.summary}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                Gerar preview normalizado tenta o backend e preserva fallback local. Apply e rollback continuam desabilitados.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => { void triggerPreview(); }} disabled={previewLoading}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {previewLoading ? "Gerando..." : "Gerar preview"}
                </Button>
                <Button type="button" variant="outline" disabled title="Rollback real desabilitado nesta fase.">
                  <Copy className="h-4 w-4 mr-2" />
                  Rollback
                </Button>
                <Button type="button" disabled title="Apply real desabilitado nesta fase. Esta edição é apenas local/read-only.">
                  <Save className="h-4 w-4 mr-2" />
                  Aplicar alterações
                </Button>
                <Button type="button" variant="secondary" onClick={() => handleCloseAttempt(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BgpCommunityEditorModal
        open={communityEditorOpen}
        onOpenChange={setCommunityEditorOpen}
        deviceName={deviceName}
        peerIp={peerIp}
        policyName={communityNode?.policy.name ?? "—"}
        afiSafi={communityNode?.policy.afiSafi ?? "unknown"}
        sequence={communityNode?.node.sequence ?? null}
        nodeLabel={communityNode?.node.sequence !== null && communityNode?.node.sequence !== undefined
          ? `node ${communityNode.node.sequence}`
          : "node ?"}
        nodeKey={communityNode?.key ?? ""}
        initialSelectedCommunities={communityNode ? extractAppliedCommunities(communityNode.node) : []}
        initialMatchedCommunityListName={communityNode ? extractCommunityListFromMatches(communityNode.node.matches) : null}
        communityOptions={communityOptions}
        communitySets={communitySetOptions}
        onSave={saveCommunityEdit}
      />

      <Dialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Alterações pendentes</DialogTitle>
            <DialogDescription>
              Existem edições locais sem apply. Escolha como continuar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Fechar com mudanças pendentes</AlertTitle>
              <AlertDescription>
                Você pode continuar editando, descartar as alterações ou fechar sem aplicar.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={continueEditing}>
              Continuar editando
            </Button>
            <Button type="button" variant="destructive" onClick={discardAndClose}>
              Descartar alterações
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setCloseConfirmOpen(false); onOpenChange(false); }}>
              Fechar sem aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
