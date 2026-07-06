import { useEffect, useMemo, useState } from "react";
import { useListDevices } from "@workspace/api-client-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { AlertCircle, Clock3, RefreshCw, Search, ShieldCheck, ClipboardList, FileClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { BgpAnnouncementPreviewModal } from "@/features/bgp/bgp-announcements-preview-modal";
import { useAuth } from "@/components/auth-provider";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/utils";

type AnnouncementMatrixCell = {
  circuitId: string;
  upstreamName: string;
  state: string;
  label?: string;
  communities?: string[];
  community: string | null;
  actionCode: string | null;
  communitySourceType?: "direct" | "community_list" | "unknown";
  communitySourceName?: string | null;
  note?: string | null;
};

type AnnouncementMatrixRow = {
  targetPolicyName?: string;
  routePolicyName: string;
  targetType: string;
  family: string;
  prefixScope: {
    type: "network" | "ip_prefix" | "ipv6_prefix" | "unknown";
    name: string;
    expandedPrefixes: Array<{ index: number | null; action: string | null; prefix: string; ge?: number | null; le?: number | null; raw: string }>;
    affectedPrefixCount: number;
    shared: boolean | null;
  };
  affectedPrefixes: string[];
  source?: "foundation" | "discovery_snapshot" | "policy_graph" | "policy_graph_community_resolver";
  confidence?: "high" | "medium" | "low";
  matrixState?: Record<string, unknown>;
  findings?: Array<{
    code: string;
    severity: "info" | "warning" | "error";
    scope: "target" | "cell" | "upstream" | "community_set" | "prefix_scope" | "protected_global_filter" | "snapshot";
    targetPolicyName?: string | null;
    node?: number | null;
    upstreamCircuitId?: string | null;
    upstreamName?: string | null;
    community?: string | null;
    communityFilter?: string | null;
    communityList?: string | null;
    prefixList?: string | null;
    message: string;
    evidence?: unknown;
    recommendation?: string | null;
  }>;
  riskLevel?: string;
  cells: Record<string, AnnouncementMatrixCell>;
  risk: string;
  node?: number | null;
};

type AnnouncementMatrixPayload = {
  columns: Array<{ key: string; label: string; upstreamCircuitId: string; upstreamName: string; role?: string | null; source?: "foundation" | "discovery_snapshot" | "policy_graph" | "policy_graph_community_resolver" }>;
  rows: AnnouncementMatrixRow[];
  generatedFrom: "foundation" | "discovery_snapshot" | "policy_graph" | "policy_graph_community_resolver";
  featureStatus: "foundation" | "target_classification" | "community_cells" | "partial" | "complete";
};

type AnnouncementMatrixSummaryPayload = {
  totalTargets: number;
  totalOriginTargets?: number;
  totalCustomerImportTargets?: number;
  totalExcludedCustomerExports?: number;
  totalExcludedUpstreamPolicies?: number;
  totalExcludedInternalPolicies?: number;
  totalUnknownPolicies?: number;
  totalOn?: number;
  totalP1?: number;
  totalP2?: number;
  totalP3?: number;
  totalP4?: number;
  totalOff?: number;
  totalUnmarked?: number;
  totalConflict?: number;
  totalUnknown?: number;
  totalExpandedPrefixes?: number;
  totalPrefixScopeUnknown?: number;
  totalUpstreams: number;
  totalCells: number;
  totalFindings: number;
  totalCriticalFindings: number;
  note: string;
  debugFindings?: Array<{
    code: string;
    severity: "info" | "warning" | "error";
    scope: "target" | "cell" | "upstream" | "community_set" | "prefix_scope" | "protected_global_filter" | "snapshot";
    targetPolicyName?: string | null;
    node?: number | null;
    upstreamCircuitId?: string | null;
    upstreamName?: string | null;
    community?: string | null;
    communityFilter?: string | null;
    communityList?: string | null;
    prefixList?: string | null;
    message: string;
    evidence?: unknown;
    recommendation?: string | null;
  }>;
  upstreamAudit?: {
    totalUpstreamsAudited: number;
    totalAuditFindings: number;
    totalCriticalAuditFindings: number;
    localAsUnknownCount: number;
    prependMismatchCount: number;
  };
};

type AnnouncementCommunitySet = {
  name: string;
  communities: string[];
  normalizedCommunities: string[];
  normalizedHash: string;
  semanticSummary: string;
  usageCount: number;
  usedByPolicies: string[];
  isShared: boolean;
  findings: Array<{ code: string; severity: "info" | "warning" | "error"; scope: string; message: string }>;
};

type AnnouncementUpstreamAudit = {
  findings: Array<{
    code: string;
    severity: "info" | "warning" | "error";
    scope: string;
    targetPolicyName?: string | null;
    node?: number | null;
    upstreamCircuitId?: string | null;
    upstreamName?: string | null;
    community?: string | null;
    communityFilter?: string | null;
    communityList?: string | null;
    prefixList?: string | null;
    message: string;
    evidence?: unknown;
    recommendation?: string | null;
  }>;
  byCircuit: Record<string, {
    circuitId: string;
    upstreamName: string;
    localAs: number | null;
    exportPolicy: string | null;
    findings: Array<{
      code: string;
      severity: "info" | "warning" | "error";
      scope: string;
      targetPolicyName?: string | null;
      node?: number | null;
      upstreamCircuitId?: string | null;
      upstreamName?: string | null;
      community?: string | null;
      communityFilter?: string | null;
      communityList?: string | null;
      prefixList?: string | null;
      message: string;
      evidence?: unknown;
      recommendation?: string | null;
    }>;
    maxSeverity: "info" | "warning" | "error" | null;
    actions: Record<string, { actionLabel: string; actionCode: string | null; community: string | null; sourceType: string; sourceName: string | null } | null>;
  }>;
  totalUpstreamsAudited: number;
  totalAuditFindings: number;
  totalCriticalAuditFindings: number;
  localAsUnknownCount: number;
  prependMismatchCount: number;
};

type AnnouncementChangePlan = {
  id: number;
  deviceId: number;
  baseSnapshotId: number;
  collectionId: number | null;
  previewId: string;
  targetPolicyName: string;
  targetType: string;
  node: number | null;
  upstreamCircuitId: string;
  upstreamName: string;
  currentState: string;
  desiredState: string;
  currentCommunity: string | null;
  desiredCommunity: string | null;
  diff: Record<string, unknown>;
  proposedCommands: Array<{ command: string; confidence: "high" | "medium" | "low"; note?: string | null }>;
  rollbackCommands: Array<{ command: string; confidence: "high" | "medium" | "low"; note?: string | null }>;
  findings: Array<{ code: string; severity: "info" | "warning" | "error"; scope: string; message: string }>;
  riskLevel: "low" | "medium" | "high" | "critical";
  status: string;
  note: string | null;
  preview: unknown;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  postcheckRequired?: boolean;
  postcheckStatus?: string | null;
  approval?: {
    id: number;
    changePlanId: number;
    deviceId: number;
    baseSnapshotId: number;
    requestedBy: number | null;
    requestedAt: string;
    reviewedBy: number | null;
    reviewedAt: string | null;
    status: string;
    reason: string | null;
    riskLevel: string;
    findings: Array<{ code: string; severity: string; scope: string; message: string }>;
    diff: Record<string, unknown>;
    proposedCommands: Array<{ command: string; confidence: "high" | "medium" | "low"; note?: string | null }>;
    rollbackCommands: Array<{ command: string; confidence: "high" | "medium" | "low"; note?: string | null }>;
    createdAt: string;
    updatedAt: string;
  } | null;
  executions?: Array<{
    id: number;
    changePlanId: number;
    approvalId: number | null;
    deviceId: number;
    mode: string;
    status: string;
    startedBy: number | null;
    startedAt: string;
    finishedAt: string | null;
    baseSnapshotId: number;
    collectionId: number | null;
    proposedCommands: Array<{ command: string; confidence: "high" | "medium" | "low"; note?: string | null }>;
    rollbackCommands: Array<{ command: string; confidence: "high" | "medium" | "low"; note?: string | null }>;
    executionLog: Array<{ step: number; type: string; command?: string; status: string; message?: string }>;
    result: Record<string, unknown>;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  latestExecution?: {
    id: number;
    changePlanId: number;
    approvalId: number | null;
    deviceId: number;
    mode: string;
    status: string;
    startedBy: number | null;
    startedAt: string;
    finishedAt: string | null;
    baseSnapshotId: number;
    collectionId: number | null;
    proposedCommands: Array<{ command: string; confidence: "high" | "medium" | "low"; note?: string | null }>;
    rollbackCommands: Array<{ command: string; confidence: "high" | "medium" | "low"; note?: string | null }>;
    executionLog: Array<{ step: number; type: string; command?: string; status: string; message?: string }>;
    result: Record<string, unknown>;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  latestPostcheck?: {
    id: number;
    changePlanId: number;
    executionId: number | null;
    deviceId: number;
    expectedSnapshotId: number | null;
    observedSnapshotId: number | null;
    expectedState: string;
    observedState: string;
    expectedCommunity: string | null;
    observedCommunity: string | null;
    status: "pending" | "running" | "succeeded" | "failed" | "inconclusive" | "skipped";
    diff: Record<string, unknown>;
    findings: Array<{ code: string; severity: string; scope: string; message: string }>;
    startedAt: string;
    finishedAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  latestRollback?: {
    id: number;
    changePlanId: number;
    executionId: number | null;
    approvalId: number | null;
    deviceId: number;
    baseSnapshotId: number;
    rollbackToSnapshotId: number;
    currentSnapshotId: number | null;
    status: string;
    mode: string;
    requestedBy: number | null;
    requestedAt: string;
    approvedBy: number | null;
    approvedAt: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    rollbackCommands: Array<{ command: string; confidence: "high" | "medium" | "low"; note?: string | null }>;
    rollbackDiff: Record<string, unknown>;
    rollbackLog: Array<{ step: number; type: string; command?: string; status: string; message?: string }>;
    postcheckId: number | null;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  rollbacks?: Array<NonNullable<AnnouncementChangePlan["latestRollback"]>>;
};

type AnnouncementRollback = NonNullable<AnnouncementChangePlan["latestRollback"]>;

type AnnouncementHistoryEvent = {
  id: number;
  deviceId: number;
  targetPolicyName: string;
  family: string;
  prefix: string | null;
  upstreamCircuitId: string | null;
  upstreamName: string | null;
  eventType: string;
  oldState: string | null;
  newState: string | null;
  oldCommunity: string | null;
  newCommunity: string | null;
  snapshotId: number;
  detectedAt: string;
  createdAt: string;
};

type AnnouncementMatrixLatestResponse = {
  empty?: boolean;
  message?: string;
  can_refresh?: boolean;
  snapshot_id?: number;
  generated_at?: string;
  collection_id?: number | null;
  is_stale?: boolean;
  matrix?: AnnouncementMatrixPayload;
  summary?: AnnouncementMatrixSummaryPayload;
  diff_summary?: { added: number; removed: number; changed: number } | null;
  run_id?: number | null;
  status?: string;
};

type AnnouncementMatrixRefreshResponse = {
  run_id: number;
  snapshot_id: number;
  generated_at: string;
  collection_id: number | null;
  matrix: AnnouncementMatrixPayload;
  summary: AnnouncementMatrixSummaryPayload;
  diff_summary: { added: number; removed: number; changed: number } | null;
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Request failed: ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function fmtDate(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString();
}

function matchesRow(row: AnnouncementMatrixRow, family: string, target: string, search: string): boolean {
  if (family !== "all" && row.family !== family) return false;
  if (target !== "all" && row.targetType !== target) return false;
  if (!search) return true;
  const haystack = [
    row.routePolicyName,
    row.targetType,
    row.family,
    row.risk,
    row.prefixScope.name,
    ...row.prefixScope.expandedPrefixes.map((item) => item.prefix),
    ...row.affectedPrefixes,
    ...Object.values(row.cells).flatMap((cell) => [cell.circuitId, cell.upstreamName, cell.state, cell.community ?? "", cell.actionCode ?? ""]),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

export default function BgpAnnouncementsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: devices = [] } = useListDevices();
  const [deviceId, setDeviceId] = useState<string>("");
  const [family, setFamily] = useState("all");
  const [target, setTarget] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedPreview, setSelectedPreview] = useState<{ row: AnnouncementMatrixRow; cell: AnnouncementMatrixCell } | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<AnnouncementChangePlan | null>(null);
  const [approvalReason, setApprovalReason] = useState("");
  const [rollbackReason, setRollbackReason] = useState("");
  const [historyTarget, setHistoryTarget] = useState("");
  const [historyUpstream, setHistoryUpstream] = useState("");
  const [historyPrefix, setHistoryPrefix] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = params.get("deviceId") ?? params.get("device_id");
    if (initial) {
      setDeviceId(initial);
      return;
    }
    if (!deviceId && devices.length > 0) {
      setDeviceId(String(devices[0]?.id ?? ""));
    }
  }, [deviceId, devices]);

  useEffect(() => {
    if (!deviceId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("deviceId", deviceId);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [deviceId]);

  useEffect(() => {
    setApprovalReason("");
  }, [selectedPlan?.id]);

  useEffect(() => {
    setRollbackReason("");
  }, [selectedPlan?.latestRollback?.id, selectedPlan?.id]);

  const matrixQuery = useQuery({
    queryKey: ["bgp-announcements", "latest", deviceId],
    queryFn: () => apiFetch<AnnouncementMatrixLatestResponse>(`/api/bgp/announcements/matrix/latest?deviceId=${deviceId}`),
    enabled: Boolean(deviceId),
    staleTime: 30_000,
  });

  const communitySetsQuery = useQuery({
    queryKey: ["bgp-announcements", "community-sets", deviceId],
    queryFn: () => apiFetch<AnnouncementCommunitySet[]>(`/api/bgp/community-sets?deviceId=${deviceId}`),
    enabled: Boolean(deviceId),
    staleTime: 30_000,
  });

  const upstreamAuditQuery = useQuery({
    queryKey: ["bgp-announcements", "upstream-audit", deviceId],
    queryFn: () => apiFetch<AnnouncementUpstreamAudit>(`/api/bgp/upstreams/audit?deviceId=${deviceId}`),
    enabled: Boolean(deviceId),
    staleTime: 30_000,
  });

  const changePlansQuery = useQuery({
    queryKey: ["bgp-announcements", "change-plans", deviceId],
    queryFn: () => apiFetch<AnnouncementChangePlan[]>(`/api/bgp/announcements/change-plans?deviceId=${deviceId}`),
    enabled: Boolean(deviceId),
    staleTime: 15_000,
  });

  const rollbacksQuery = useQuery({
    queryKey: ["bgp-announcements", "rollbacks", deviceId],
    queryFn: () => apiFetch<AnnouncementRollback[]>(`/api/bgp/announcements/rollbacks?deviceId=${deviceId}`),
    enabled: Boolean(deviceId),
    staleTime: 15_000,
  });

  const historyQuery = useQuery({
    queryKey: ["bgp-announcements", "history", deviceId, historyTarget, historyUpstream, historyPrefix],
    queryFn: () => {
      const q = new URLSearchParams();
      q.set("deviceId", deviceId);
      if (historyTarget.trim()) q.set("targetPolicyName", historyTarget.trim());
      if (historyUpstream.trim()) q.set("upstreamName", historyUpstream.trim());
      if (historyPrefix.trim()) q.set("prefix", historyPrefix.trim());
      return apiFetch<AnnouncementHistoryEvent[]>(`/api/bgp/announcements/history?${q.toString()}`);
    },
    enabled: Boolean(deviceId),
    staleTime: 15_000,
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiFetch<AnnouncementMatrixRefreshResponse>("/api/bgp/announcements/matrix/refresh", {
      method: "POST",
      body: JSON.stringify({ deviceId: Number(deviceId) }),
    }),
    onSuccess: (result) => {
      queryClient.setQueryData(["bgp-announcements", "latest", deviceId], {
        snapshot_id: result.snapshot_id,
        generated_at: result.generated_at,
        collection_id: result.collection_id,
        is_stale: false,
        matrix: result.matrix,
        summary: result.summary,
        diff_summary: result.diff_summary,
        run_id: result.run_id,
        status: "completed",
      } satisfies AnnouncementMatrixLatestResponse);
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "community-sets", deviceId] });
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "upstream-audit", deviceId] });
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "change-plans", deviceId] });
    },
  });

  const cancelPlanMutation = useMutation({
    mutationFn: (planId: number) => apiFetch<AnnouncementChangePlan>(`/api/bgp/announcements/change-plans/${planId}/cancel`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "change-plans", deviceId] });
    },
  });

  const requestApprovalMutation = useMutation({
    mutationFn: (planId: number) => apiFetch(`/api/bgp/announcements/change-plans/${planId}/request-approval`, {
      method: "POST",
      body: JSON.stringify({ note: approvalReason.trim() || null }),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "change-plans", deviceId] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (approvalId: number) => apiFetch(`/api/bgp/announcements/approvals/${approvalId}/approve`, {
      method: "POST",
      body: JSON.stringify({ reason: approvalReason.trim() || null }),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "change-plans", deviceId] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (approvalId: number) => apiFetch(`/api/bgp/announcements/approvals/${approvalId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason: approvalReason.trim() || null }),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "change-plans", deviceId] });
    },
  });

  const dryRunMutation = useMutation({
    mutationFn: (planId: number) => apiFetch(`/api/bgp/announcements/change-plans/${planId}/dry-run`, {
      method: "POST",
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "change-plans", deviceId] });
    },
  });

  const postcheckMutation = useMutation({
    mutationFn: (planId: number) => apiFetch(`/api/bgp/announcements/change-plans/${planId}/postcheck`, {
      method: "POST",
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "change-plans", deviceId] });
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "latest", deviceId] });
    },
  });

  const requestRollbackMutation = useMutation({
    mutationFn: (planId: number) => apiFetch(`/api/bgp/announcements/change-plans/${planId}/rollback/request`, {
      method: "POST",
      body: JSON.stringify({ note: rollbackReason.trim() || null }),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "change-plans", deviceId] });
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "rollbacks", deviceId] });
    },
  });

  const approveRollbackMutation = useMutation({
    mutationFn: (rollbackId: number) => apiFetch(`/api/bgp/announcements/rollbacks/${rollbackId}/approve`, {
      method: "POST",
      body: JSON.stringify({ reason: rollbackReason.trim() || null }),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "change-plans", deviceId] });
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "rollbacks", deviceId] });
    },
  });

  const rejectRollbackMutation = useMutation({
    mutationFn: (rollbackId: number) => apiFetch(`/api/bgp/announcements/rollbacks/${rollbackId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason: rollbackReason.trim() || null }),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "change-plans", deviceId] });
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "rollbacks", deviceId] });
    },
  });

  const rollbackDryRunMutation = useMutation({
    mutationFn: (rollbackId: number) => apiFetch(`/api/bgp/announcements/rollbacks/${rollbackId}/dry-run`, {
      method: "POST",
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "change-plans", deviceId] });
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "rollbacks", deviceId] });
    },
  });

  const rollbackExecuteMutation = useMutation({
    mutationFn: (rollbackId: number) => apiFetch(`/api/bgp/announcements/rollbacks/${rollbackId}/execute`, {
      method: "POST",
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "change-plans", deviceId] });
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "rollbacks", deviceId] });
    },
  });

  const rollbackPostcheckMutation = useMutation({
    mutationFn: (rollbackId: number) => apiFetch(`/api/bgp/announcements/rollbacks/${rollbackId}/postcheck`, {
      method: "POST",
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "change-plans", deviceId] });
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "rollbacks", deviceId] });
      void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "latest", deviceId] });
    },
  });

  const latest = matrixQuery.data ?? null;
  const rows = latest?.matrix?.rows ?? [];
  const columns = latest?.matrix?.columns ?? [];
  const rollbacks = rollbacksQuery.data ?? [];
  const filteredRows = useMemo(
    () => rows.filter((row) => matchesRow(row, family, target, search.trim())),
    [family, rows, search, target],
  );

  const activeDevice = devices.find((item) => String(item.id) === deviceId) ?? null;
  const canOperateBgpAnnouncements = user?.role === "admin" || user?.role === "operator";
  const canRefresh = latest?.can_refresh ?? true;
  const isEmpty = latest?.empty || rows.length === 0;
  const summary = latest?.summary ?? null;
  const selectedPreviewRow = selectedPreview?.row ?? null;
  const selectedPreviewCell = selectedPreview?.cell ?? null;
  const selectedRollback = selectedPlan?.latestRollback ?? null;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{t("bgpAnnouncements.title")}</h1>
          <Badge variant="outline" className="gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t("bgpAnnouncements.readOnly")}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <ClipboardList className="h-3.5 w-3.5" />
            {t("bgpAnnouncements.sourceLabel")} {latest?.matrix?.generatedFrom ?? "foundation"}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <FileClock className="h-3.5 w-3.5" />
            {t("bgpAnnouncements.collectionLabel")} {fmtDate(latest?.generated_at)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("bgpAnnouncements.subtitle")}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("bgpAnnouncements.context")}</CardTitle>
          <CardDescription>{t("bgpAnnouncements.contextHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(220px,360px)_minmax(180px,220px)_minmax(180px,220px)_minmax(180px,220px)]">
          <div className="space-y-2">
            <Label>{t("bgpAnnouncements.device")}</Label>
            <Select value={deviceId} onValueChange={setDeviceId} disabled={devices.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={t("bgpAnnouncements.selectDevice")} />
              </SelectTrigger>
              <SelectContent>
                {devices.map((device) => (
                  <SelectItem key={device.id} value={String(device.id)}>
                    #{device.id} {device.hostname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("bgpAnnouncements.family")}</Label>
            <Select value={family} onValueChange={setFamily}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("bgpAnnouncements.familyAll")}</SelectItem>
                <SelectItem value="ipv4">{t("bgpAnnouncements.familyIpv4")}</SelectItem>
                <SelectItem value="ipv6">{t("bgpAnnouncements.familyIpv6")}</SelectItem>
                <SelectItem value="mixed">{t("bgpAnnouncements.familyMixed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("bgpAnnouncements.target")}</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("bgpAnnouncements.targetAll")}</SelectItem>
                <SelectItem value="origin_target">origin_target</SelectItem>
                <SelectItem value="customer_import_target">customer_import_target</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("bgpAnnouncements.search")}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("bgpAnnouncements.searchPlaceholder")}
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void refreshMutation.mutateAsync()} disabled={!deviceId || !canRefresh || refreshMutation.isPending}>
          <RefreshCw className={cn("mr-2 h-4 w-4", refreshMutation.isPending ? "animate-spin" : "")} />
          {t("bgpAnnouncements.refresh")}
        </Button>
        <Badge variant="secondary" className="bg-slate-500/10 text-slate-300">
          {t("bgpAnnouncements.snapshotBadge", { id: latest?.snapshot_id ?? "n/a" })}
        </Badge>
        {latest?.is_stale ? (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300">
            {t("bgpAnnouncements.snapshotStale")}
          </Badge>
        ) : null}
        {refreshMutation.isPending ? (
          <Badge variant="outline" className="gap-1 border-sky-500/40 bg-sky-500/10 text-sky-300">
            <RefreshCw className="h-3 w-3 animate-spin" />
            {t("bgpAnnouncements.refreshInProgress")}
          </Badge>
        ) : null}
        <Badge variant="secondary" className="bg-slate-500/10 text-slate-300">
          {t("bgpAnnouncements.collectionBadge", { id: latest?.collection_id ?? "n/a" })}
        </Badge>
        <Badge variant="secondary" className="bg-slate-500/10 text-slate-300">
          {t("bgpAnnouncements.deviceBadge", { name: activeDevice ? activeDevice.hostname : "n/a" })}
        </Badge>
        <Badge variant="secondary" className="bg-slate-500/10 text-slate-300">
          {t("bgpAnnouncements.rollbacksBadge", { count: rollbacks.length })}
        </Badge>
      </div>

      {summary ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">{t("bgpAnnouncements.summaryTargets")}</div><div className="mt-1 text-2xl font-bold">{summary.totalTargets ?? 0}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">{t("bgpAnnouncements.summaryOrigin")}</div><div className="mt-1 text-2xl font-bold text-emerald-400">{summary.totalOriginTargets ?? 0}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">{t("bgpAnnouncements.summaryCustomerImport")}</div><div className="mt-1 text-2xl font-bold text-sky-400">{summary.totalCustomerImportTargets ?? 0}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">{t("bgpAnnouncements.summaryCustExportExcluded")}</div><div className="mt-1 text-2xl font-bold text-amber-400">{summary.totalExcludedCustomerExports ?? 0}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">{t("bgpAnnouncements.summaryUpstreamExcluded")}</div><div className="mt-1 text-2xl font-bold text-amber-400">{summary.totalExcludedUpstreamPolicies ?? 0}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">{t("bgpAnnouncements.summaryUnknown")}</div><div className="mt-1 text-2xl font-bold">{summary.totalUnknownPolicies ?? 0}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">{t("bgpAnnouncements.summaryOnP1P2")}</div><div className="mt-1 text-2xl font-bold">{[summary.totalOn ?? 0, summary.totalP1 ?? 0, summary.totalP2 ?? 0].join(" / ")}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">{t("bgpAnnouncements.summaryP3P4Off")}</div><div className="mt-1 text-2xl font-bold">{[summary.totalP3 ?? 0, summary.totalP4 ?? 0, summary.totalOff ?? 0].join(" / ")}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">{t("bgpAnnouncements.summaryUnmarkedConflictUnknown")}</div><div className="mt-1 text-2xl font-bold">{[summary.totalUnmarked ?? 0, summary.totalConflict ?? 0, summary.totalUnknown ?? 0].join(" / ")}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">{t("bgpAnnouncements.summaryExpandedPrefixes")}</div><div className="mt-1 text-2xl font-bold">{summary.totalExpandedPrefixes ?? 0}</div></CardContent></Card>
        </div>
      ) : null}

      {matrixQuery.error || refreshMutation.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {refreshMutation.error instanceof Error
              ? refreshMutation.error.message
              : matrixQuery.error instanceof Error
                ? matrixQuery.error.message
                : t("bgpAnnouncements.loadError")}
          </span>
        </div>
      ) : null}

      <Tabs defaultValue="matrix" className="space-y-4">
        <TabsList>
          <TabsTrigger value="matrix">{t("bgpAnnouncements.tabMatrix")}</TabsTrigger>
          <TabsTrigger value="upstreams">{t("bgpAnnouncements.tabUpstreams")}</TabsTrigger>
          <TabsTrigger value="sets">{t("bgpAnnouncements.communitySetsTitle")}</TabsTrigger>
          <TabsTrigger value="plans">{t("bgpAnnouncements.changePlansTitle")}</TabsTrigger>
          <TabsTrigger value="history">{t("bgpAnnouncements.tabHistory")}</TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="space-y-4">
          {matrixQuery.isLoading ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">{t("bgpAnnouncements.loadingSnapshot")}</CardContent>
            </Card>
          ) : isEmpty ? (
            <Card>
              <CardContent className="p-8">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ClipboardList className="h-6 w-6" />
                    </EmptyMedia>
                    <EmptyTitle>{t("bgpAnnouncements.noSnapshotTitle")}</EmptyTitle>
                    <EmptyDescription>{t("bgpAnnouncements.noSnapshotDescription")}</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button onClick={() => void refreshMutation.mutateAsync()} disabled={!deviceId || refreshMutation.isPending}>
                      <RefreshCw className={cn("mr-2 h-4 w-4", refreshMutation.isPending ? "animate-spin" : "")} />
                      {t("bgpAnnouncements.refreshNow")}
                    </Button>
                  </EmptyContent>
                </Empty>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("bgpAnnouncements.matrixRows")}</CardTitle>
                <CardDescription>
                  {t("bgpAnnouncements.visibleRows", { visible: filteredRows.length, total: rows.length })}
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("bgpAnnouncements.targetPolicy")}</TableHead>
                      <TableHead>{t("bgpAnnouncements.type")}</TableHead>
                      <TableHead>{t("bgpAnnouncements.family")}</TableHead>
                      <TableHead>{t("bgpAnnouncements.prefixScope")}</TableHead>
                      {columns.map((column) => (
                        <TableHead key={column.key} className="min-w-[140px]">
                          <div className="flex flex-col">
                            <span>{column.label}</span>
                            <span className="text-[10px] font-normal text-muted-foreground">{column.upstreamName}</span>
                          </div>
                        </TableHead>
                      ))}
                      <TableHead>{t("bgpAnnouncements.risk")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5 + columns.length} className="py-10 text-center text-muted-foreground">
                          {t("bgpAnnouncements.noMatchingRows")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRows.map((row) => (
                        <TableRow key={`${row.routePolicyName}-${row.family}`}>
                          <TableCell className="font-mono text-xs">{row.targetPolicyName ?? row.routePolicyName}</TableCell>
                          <TableCell>{row.targetType}</TableCell>
                          <TableCell>{row.family}</TableCell>
                          <TableCell className="max-w-[320px] text-xs text-muted-foreground">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{row.prefixScope.type}</Badge>
                                <span>{row.prefixScope.name}</span>
                                {row.prefixScope.shared ? <Badge variant="secondary">shared</Badge> : null}
                              </div>
                              <div>
                                {row.prefixScope.expandedPrefixes.length > 0 ? (
                                  <details>
                                    <summary className="cursor-pointer text-xs text-sky-300">{t("bgpAnnouncements.expandPrefixes", { count: row.prefixScope.affectedPrefixCount })}</summary>
                                    <div className="mt-2 space-y-1">
                                      {row.prefixScope.expandedPrefixes.map((item) => (
                                        <div key={`${row.routePolicyName}-${item.raw}`} className="rounded border border-border bg-background/40 px-2 py-1">
                                          <div className="font-mono text-[11px]">{item.prefix}</div>
                                          <div className="text-[10px] text-muted-foreground">{item.raw}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                ) : (
                                  "—"
                                )}
                              </div>
                              {row.findings?.some((finding) => finding.code === "COMMUNITY_SET_EXACT_MATCH_FOUND" || finding.code === "TARGET_POLICY_USES_SHARED_COMMUNITY_LIST") ? (
                                <div className="flex flex-wrap gap-2">
                                  {row.findings.some((finding) => finding.code === "COMMUNITY_SET_EXACT_MATCH_FOUND") ? (
                                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-300">{t("bgpAnnouncements.exactCommunityList")}</Badge>
                                  ) : null}
                                  {row.findings.some((finding) => finding.code === "TARGET_POLICY_USES_SHARED_COMMUNITY_LIST") ? (
                                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-300">{t("bgpAnnouncements.sharedList")}</Badge>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </TableCell>
                          {columns.map((column) => {
                            const cell = row.cells[column.upstreamCircuitId];
                            return (
                              <TableCell key={`${row.routePolicyName}-${column.key}`}>
                                {cell ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedPreview({ row, cell })}
                                    className="w-full rounded-md border border-transparent p-1 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
                                  >
                                    <div className="space-y-1 text-xs">
                                      <Badge variant="secondary" className="bg-slate-500/10 text-slate-300">
                                        {cell.label ?? cell.state}
                                      </Badge>
                                      <div className="font-mono text-[11px] text-muted-foreground">{cell.community ?? "—"}</div>
                                      {cell.communitySourceType ? (
                                        <div className="text-[10px] text-muted-foreground">
                                          {cell.communitySourceType}
                                          {cell.communitySourceName ? ` / ${cell.communitySourceName}` : ""}
                                        </div>
                                      ) : null}
                                    </div>
                                  </button>
                                ) : null}
                              </TableCell>
                            );
                          })}
                          <TableCell>{row.riskLevel ?? row.risk}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="upstreams">
          {upstreamAuditQuery.isLoading ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">{t("bgpAnnouncements.loadingAudit")}</CardContent></Card>
          ) : upstreamAuditQuery.error ? (
            <Card><CardContent className="p-6 text-sm text-destructive">{upstreamAuditQuery.error instanceof Error ? upstreamAuditQuery.error.message : t("bgpAnnouncements.auditLoadError")}</CardContent></Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("bgpAnnouncements.upstreamAuditTitle")}</CardTitle>
                <CardDescription>
                  {t("bgpAnnouncements.upstreamAuditSummary", { upstreams: upstreamAuditQuery.data?.totalUpstreamsAudited ?? 0, findings: upstreamAuditQuery.data?.totalAuditFindings ?? 0 })}
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("bgpAnnouncements.upstream")}</TableHead>
                      <TableHead>CID</TableHead>
                      <TableHead>Local-AS</TableHead>
                      <TableHead>{t("bgpAnnouncements.exportPolicy")}</TableHead>
                      {["On", "P1", "P2", "P3", "P4", "Off", "NE", "BH", "Def", "Rx"].map((label) => (
                        <TableHead key={label} className="min-w-[110px]">{label}</TableHead>
                      ))}
                      <TableHead>{t("bgpAnnouncements.findings")}</TableHead>
                      <TableHead>{t("bgpAnnouncements.severity")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.values(upstreamAuditQuery.data?.byCircuit ?? {}).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={15} className="py-10 text-center text-muted-foreground">{t("bgpAnnouncements.noUpstreamAudited")}</TableCell>
                      </TableRow>
                    ) : (
                      Object.values(upstreamAuditQuery.data?.byCircuit ?? {}).map((audit) => (
                        <TableRow key={audit.circuitId}>
                          <TableCell className="font-mono text-xs">{audit.upstreamName}</TableCell>
                          <TableCell className="font-mono text-xs">{audit.circuitId}</TableCell>
                          <TableCell className="font-mono text-xs">{audit.localAs ?? "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{audit.exportPolicy ?? "—"}</TableCell>
                          {["On", "P1", "P2", "P3", "P4", "Off", "NE", "BH", "Def", "Rx"].map((label) => {
                            const action = audit.actions[label];
                            return (
                              <TableCell key={`${audit.circuitId}-${label}`}>
                                {action ? (
                                  <div className="space-y-1 text-xs">
                                    <Badge variant="secondary" className="bg-slate-500/10 text-slate-300">{action.actionLabel}</Badge>
                                    <div className="font-mono text-[11px] text-muted-foreground">{action.community ?? "—"}</div>
                                  </div>
                                ) : "—"}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-xs">
                            {audit.findings.length}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={cn(
                              audit.maxSeverity === "error"
                                ? "bg-red-500/10 text-red-300"
                                : audit.maxSeverity === "warning"
                                  ? "bg-amber-500/10 text-amber-300"
                                  : "bg-slate-500/10 text-slate-300",
                            )}>
                              {audit.maxSeverity ?? "none"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="sets">
          {communitySetsQuery.isLoading ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">{t("bgpAnnouncements.loadingCommunitySets")}</CardContent></Card>
          ) : communitySetsQuery.error ? (
            <Card><CardContent className="p-6 text-sm text-destructive">{communitySetsQuery.error instanceof Error ? communitySetsQuery.error.message : t("bgpAnnouncements.communitySetsLoadError")}</CardContent></Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("bgpAnnouncements.communitySetsTitle")}</CardTitle>
                <CardDescription>{t("bgpAnnouncements.normalizedSets", { count: communitySetsQuery.data?.length ?? 0 })}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(communitySetsQuery.data ?? []).length === 0 ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><ClipboardList className="h-6 w-6" /></EmptyMedia>
                      <EmptyTitle>{t("bgpAnnouncements.noCommunitySetTitle")}</EmptyTitle>
                      <EmptyDescription>{t("bgpAnnouncements.noCommunitySetDescription")}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  (communitySetsQuery.data ?? []).map((set) => (
                    <details key={set.normalizedHash} className="rounded-lg border border-border bg-background/40 p-3">
                      <summary className="cursor-pointer list-none">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-medium">{set.name}</div>
                            <div className="font-mono text-[11px] text-muted-foreground">{set.normalizedHash}</div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="bg-slate-500/10 text-slate-300">{t("bgpAnnouncements.communitiesCount", { count: set.communities.length })}</Badge>
                            <Badge variant="secondary" className={set.isShared ? "bg-amber-500/10 text-amber-300" : "bg-emerald-500/10 text-emerald-300"}>{set.isShared ? t("bgpAnnouncements.shared") : t("bgpAnnouncements.exclusive")}</Badge>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">{set.semanticSummary || "—"}</div>
                      </summary>
                      <div className="mt-3 space-y-2 text-xs">
                        <div>{t("bgpAnnouncements.usagePolicies", { usage: set.usageCount, policies: set.usedByPolicies.join(", ") || "—" })}</div>
                        <div>{t("bgpAnnouncements.findingsCount", { count: set.findings.length })}</div>
                        <div className="flex flex-wrap gap-2">
                          {set.communities.map((community) => (
                            <Badge key={`${set.name}-${community}`} variant="secondary" className="bg-slate-500/10 text-slate-300 font-mono">{community}</Badge>
                          ))}
                        </div>
                      </div>
                    </details>
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="plans">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("bgpAnnouncements.changePlansTitle")}</CardTitle>
              <CardDescription>{t("bgpAnnouncements.changePlansDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>{t("bgpAnnouncements.target")}</TableHead>
                    <TableHead>{t("bgpAnnouncements.upstream")}</TableHead>
                    <TableHead>{t("bgpAnnouncements.currentDesired")}</TableHead>
                    <TableHead>{t("bgpAnnouncements.risk")}</TableHead>
                    <TableHead>{t("bgpAnnouncements.created")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead>{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(changePlansQuery.data ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">{t("bgpAnnouncements.noDrafts")}</TableCell>
                    </TableRow>
                  ) : (
                    (changePlansQuery.data ?? []).map((plan) => (
                      <TableRow key={plan.id}>
                        <TableCell className="font-mono text-xs">#{plan.id}</TableCell>
                        <TableCell className="font-mono text-xs">{plan.targetPolicyName}</TableCell>
                        <TableCell className="font-mono text-xs">{plan.upstreamName} / {plan.upstreamCircuitId}</TableCell>
                        <TableCell className="text-xs">{plan.currentState} → {plan.desiredState}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={cn(
                            plan.riskLevel === "critical"
                              ? "bg-red-500/10 text-red-300"
                              : plan.riskLevel === "high"
                                ? "bg-amber-500/10 text-amber-300"
                                : plan.riskLevel === "medium"
                                  ? "bg-sky-500/10 text-sky-300"
                                  : "bg-emerald-500/10 text-emerald-300",
                          )}>
                            {plan.riskLevel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{fmtDate(plan.createdAt)}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline">{plan.status}</Badge>
                            {plan.approval?.status ? <Badge variant="secondary">{plan.approval.status}</Badge> : null}
                            {plan.latestExecution?.status ? <Badge variant="secondary">{plan.latestExecution.status}</Badge> : null}
                            {plan.latestPostcheck?.status ? <Badge variant="secondary">{plan.latestPostcheck.status}</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell className="space-x-2">
                          <Button variant="outline" size="sm" onClick={() => setSelectedPlan(plan)}>{t("bgpAnnouncements.details")}</Button>
                          {plan.status === "draft" ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void cancelPlanMutation.mutateAsync(plan.id)}
                              disabled={cancelPlanMutation.isPending}
                            >
                              {t("common.cancel")}
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock3 className="h-4 w-4" />
                Timelapse
              </CardTitle>
              <CardDescription>{t("bgpAnnouncements.timelapseDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>{t("bgpAnnouncements.target")}</Label>
                  <Input value={historyTarget} onChange={(event) => setHistoryTarget(event.target.value)} placeholder="ORIGIN-X" />
                </div>
                <div className="space-y-1">
                  <Label>{t("bgpAnnouncements.upstream")}</Label>
                  <Input value={historyUpstream} onChange={(event) => setHistoryUpstream(event.target.value)} placeholder="C10" />
                </div>
                <div className="space-y-1">
                  <Label>{t("bgpAnnouncements.prefix")}</Label>
                  <Input value={historyPrefix} onChange={(event) => setHistoryPrefix(event.target.value)} placeholder="45.169.160.0/23" />
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>{t("bgpAnnouncements.target")}</TableHead>
                      <TableHead>{t("bgpAnnouncements.upstream")}</TableHead>
                      <TableHead>{t("bgpAnnouncements.event")}</TableHead>
                      <TableHead>{t("bgpAnnouncements.before")}</TableHead>
                      <TableHead>{t("bgpAnnouncements.after")}</TableHead>
                      <TableHead>Snapshot</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(historyQuery.data ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                          {t("bgpAnnouncements.noHistoryEvents")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      (historyQuery.data ?? []).map((event) => (
                        <TableRow key={event.id}>
                          <TableCell className="text-xs">{fmtDate(event.detectedAt)}</TableCell>
                          <TableCell className="font-mono text-xs">{event.targetPolicyName}</TableCell>
                          <TableCell className="text-xs">{event.upstreamName ?? "—"} / {event.upstreamCircuitId ?? "—"}</TableCell>
                          <TableCell className="text-xs">{event.eventType}</TableCell>
                          <TableCell className="text-xs">{event.oldState ?? "—"} / {event.oldCommunity ?? "—"}</TableCell>
                          <TableCell className="text-xs">{event.newState ?? "—"} / {event.newCommunity ?? "—"}</TableCell>
                          <TableCell className="font-mono text-xs">#{event.snapshotId}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <BgpAnnouncementPreviewModal
        open={Boolean(selectedPreview)}
        onOpenChange={(open) => {
          if (!open) setSelectedPreview(null);
        }}
        deviceId={deviceId ? Number(deviceId) : null}
        snapshotId={latest?.snapshot_id ?? null}
        row={selectedPreviewRow}
        cell={selectedPreviewCell}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "change-plans", deviceId] });
          void queryClient.invalidateQueries({ queryKey: ["bgp-announcements", "latest", deviceId] });
        }}
      />

      <Dialog open={Boolean(selectedPlan)} onOpenChange={(open) => { if (!open) setSelectedPlan(null); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("bgpAnnouncements.changePlanTitle", { id: selectedPlan?.id ?? "-" })}</DialogTitle>
            <DialogDescription>
              {t("bgpAnnouncements.changePlanDescription")}
            </DialogDescription>
          </DialogHeader>
          {selectedPlan ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <div><span className="text-muted-foreground">{t("bgpAnnouncements.baseSnapshot")}</span> {selectedPlan.baseSnapshotId}</div>
                <div><span className="text-muted-foreground">{t("bgpAnnouncements.collection")}</span> {selectedPlan.collectionId ?? "—"}</div>
                <div><span className="text-muted-foreground">{t("bgpAnnouncements.target")}:</span> {selectedPlan.targetPolicyName}</div>
                <div><span className="text-muted-foreground">{t("bgpAnnouncements.upstream")}:</span> {selectedPlan.upstreamName} / {selectedPlan.upstreamCircuitId}</div>
                <div><span className="text-muted-foreground">{t("bgpAnnouncements.currentDesired")}</span> {selectedPlan.currentState} → {selectedPlan.desiredState}</div>
                <div><span className="text-muted-foreground">{t("bgpAnnouncements.risk")}:</span> {selectedPlan.riskLevel}</div>
                <div><span className="text-muted-foreground">{t("bgpAnnouncements.postcheck")}</span> {selectedPlan.postcheckStatus ?? "pending"}{selectedPlan.postcheckRequired ? t("bgpAnnouncements.postcheckRequired") : ""}</div>
                <div><span className="text-muted-foreground">Status:</span> {selectedPlan.status}</div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t("bgpAnnouncements.reasonNote")}</Label>
                  <Textarea rows={3} value={approvalReason} onChange={(event) => setApprovalReason(event.target.value)} placeholder={t("common.optional")} />
                </div>
                <div className="space-y-1">
                  <Label>{t("bgpAnnouncements.approval")}</Label>
                  <div className="rounded-lg border border-border bg-background/40 p-3 text-xs">
                    <div>Status: {selectedPlan.approval?.status ?? "none"}</div>
                    <div>{t("bgpAnnouncements.reviewer")} {selectedPlan.approval?.reviewedBy ?? "—"}</div>
                    <div>{t("bgpAnnouncements.reason")} {selectedPlan.approval?.reason ?? "—"}</div>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background/40 p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Postcheck {selectedPlan.postcheckStatus ?? "pending"}</Badge>
                  {selectedPlan.latestPostcheck?.status ? <Badge variant="secondary">{selectedPlan.latestPostcheck.status}</Badge> : null}
                  {selectedPlan.postcheckRequired ? <Badge variant="secondary">{t("bgpAnnouncements.required")}</Badge> : <Badge variant="secondary">{t("bgpAnnouncements.skipped")}</Badge>}
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div>{t("bgpAnnouncements.expected")} {selectedPlan.desiredState} / {selectedPlan.desiredCommunity ?? "—"}</div>
                  <div>{t("bgpAnnouncements.observed")} {selectedPlan.latestPostcheck?.observedState ?? "—"} / {selectedPlan.latestPostcheck?.observedCommunity ?? "—"}</div>
                  <div>Base snapshot: {selectedPlan.baseSnapshotId}</div>
                  <div>Observed snapshot: {selectedPlan.latestPostcheck?.observedSnapshotId ?? "—"}</div>
                </div>
                {selectedPlan.latestPostcheck ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-sky-300">{t("bgpAnnouncements.viewPostcheckDiff")}</summary>
                    <pre className="mt-2 overflow-auto rounded border border-border bg-muted/40 p-2 text-[10px] leading-4">
{JSON.stringify({ diff: selectedPlan.latestPostcheck.diff, findings: selectedPlan.latestPostcheck.findings }, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">{t("bgpAnnouncements.diff")}</div>
                <pre className="mt-2 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-5">
{JSON.stringify(selectedPlan.diff, null, 2)}
                </pre>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">{t("bgpAnnouncements.commands")}</div>
                <pre className="mt-2 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-5">
{selectedPlan.proposedCommands.map((item) => `${item.command}`).join("\n")}
                </pre>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">{t("bgpAnnouncements.rollback")}</div>
                <pre className="mt-2 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-5">
{selectedPlan.rollbackCommands.map((item) => `${item.command}`).join("\n")}
                </pre>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">{t("bgpAnnouncements.findings")}</div>
                <div className="mt-2 space-y-2">
                  {selectedPlan.findings.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t("bgpAnnouncements.noFindings")}</div>
                  ) : selectedPlan.findings.map((finding) => (
                    <div key={`${finding.code}-${finding.message}`} className="rounded-lg border border-border bg-background/50 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{finding.severity}</Badge>
                        <Badge variant="outline">{finding.scope}</Badge>
                        <span className="font-mono text-xs">{finding.code}</span>
                      </div>
                      <div className="mt-1 text-muted-foreground">{finding.message}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">{t("bgpAnnouncements.executions")}</div>
                <div className="mt-2 space-y-2">
                  {(selectedPlan.executions ?? []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t("bgpAnnouncements.noDryRun")}</div>
                  ) : (
                    (selectedPlan.executions ?? []).map((execution) => (
                      <div key={execution.id} className="rounded-lg border border-border bg-background/50 p-3 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{execution.mode}</Badge>
                          <Badge variant="outline">{execution.status}</Badge>
                          <span className="text-muted-foreground">#{execution.id}</span>
                        </div>
                        <div className="mt-2">{t("bgpAnnouncements.started")} {fmtDate(execution.startedAt)} · {t("bgpAnnouncements.finished")} {fmtDate(execution.finishedAt)}</div>
                        <div className="mt-2">
                          <div className="text-[10px] uppercase text-muted-foreground">{t("bgpAnnouncements.executionLog")}</div>
                          <pre className="mt-1 overflow-auto rounded border border-border bg-muted/40 p-2 text-[10px] leading-4">
{JSON.stringify(execution.executionLog, null, 2)}
                          </pre>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">{t("bgpAnnouncements.rollback")}</div>
                <div className="mt-2 space-y-2">
                  <div className="space-y-1">
                    <Label>{t("bgpAnnouncements.rollbackNote")}</Label>
                    <Textarea rows={2} value={rollbackReason} onChange={(event) => setRollbackReason(event.target.value)} placeholder={t("common.optional")} />
                  </div>
                  {selectedRollback ? (
                    <div className="rounded-lg border border-border bg-background/50 p-3 text-xs space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{selectedRollback.status}</Badge>
                        <Badge variant="secondary">{selectedRollback.mode}</Badge>
                        <span className="text-muted-foreground">#{selectedRollback.id}</span>
                      </div>
                      <div>Requested: {fmtDate(selectedRollback.requestedAt)} · Approved: {fmtDate(selectedRollback.approvedAt)}</div>
                      <div>Base snapshot: {selectedRollback.baseSnapshotId} · Rollback to: {selectedRollback.rollbackToSnapshotId}</div>
                      <div>Current snapshot: {selectedRollback.currentSnapshotId ?? "—"}</div>
                      <details>
                        <summary className="cursor-pointer text-[11px] text-sky-300">{t("bgpAnnouncements.viewRollbackDiff")}</summary>
                        <pre className="mt-2 overflow-auto rounded border border-border bg-muted/40 p-2 text-[10px] leading-4">
{JSON.stringify(selectedRollback.rollbackDiff, null, 2)}
                        </pre>
                      </details>
                      <details>
                        <summary className="cursor-pointer text-[11px] text-sky-300">{t("bgpAnnouncements.viewRollbackLog")}</summary>
                        <pre className="mt-2 overflow-auto rounded border border-border bg-muted/40 p-2 text-[10px] leading-4">
{JSON.stringify(selectedRollback.rollbackLog, null, 2)}
                        </pre>
                      </details>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">{t("bgpAnnouncements.noRollbackRequested")}</div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedPlan.status === "draft" && canOperateBgpAnnouncements ? (
                  <>
                    <Button onClick={() => void requestApprovalMutation.mutateAsync(selectedPlan.id)} disabled={requestApprovalMutation.isPending}>
                      {t("bgpAnnouncements.requestApproval")}
                    </Button>
                    <Button variant="secondary" onClick={() => void cancelPlanMutation.mutateAsync(selectedPlan.id)} disabled={cancelPlanMutation.isPending}>
                      Cancelar
                    </Button>
                  </>
                ) : null}
                {selectedPlan.status === "pending_approval" && canOperateBgpAnnouncements ? (
                  <>
                    <Button onClick={() => void approveMutation.mutateAsync(selectedPlan.approval?.id ?? 0)} disabled={!selectedPlan.approval?.id || approveMutation.isPending}>
                      {t("bgpAnnouncements.approve")}
                    </Button>
                    <Button variant="destructive" onClick={() => void rejectMutation.mutateAsync(selectedPlan.approval?.id ?? 0)} disabled={!selectedPlan.approval?.id || rejectMutation.isPending}>
                      {t("bgpAnnouncements.reject")}
                    </Button>
                  </>
                ) : null}
                {selectedPlan.status === "approved" && canOperateBgpAnnouncements ? (
                  <>
                    <Button onClick={() => void dryRunMutation.mutateAsync(selectedPlan.id)} disabled={dryRunMutation.isPending || !selectedPlan.approval?.id}>
                      {t("bgpAnnouncements.runDryRun")}
                    </Button>
                    <Badge variant="outline">{t("bgpAnnouncements.realExecutionBlocked")}</Badge>
                  </>
                ) : null}
                {selectedPlan.postcheckRequired && (selectedPlan.status === "approved" || selectedPlan.status === "dry_run_succeeded") && canOperateBgpAnnouncements ? (
                  <Button onClick={() => void postcheckMutation.mutateAsync(selectedPlan.id)} disabled={postcheckMutation.isPending}>
                    {t("bgpAnnouncements.runPostcheck")}
                  </Button>
                ) : null}
                {canOperateBgpAnnouncements && (selectedPlan.status === "approved" || selectedPlan.status === "dry_run_succeeded" || selectedPlan.status === "execution_blocked") ? (
                  <Button onClick={() => void requestRollbackMutation.mutateAsync(selectedPlan.id)} disabled={requestRollbackMutation.isPending}>
                    {t("bgpAnnouncements.requestRollback")}
                  </Button>
                ) : null}
                {selectedRollback?.status === "pending_approval" && canOperateBgpAnnouncements ? (
                  <>
                    <Button onClick={() => void approveRollbackMutation.mutateAsync(selectedRollback.id)} disabled={approveRollbackMutation.isPending}>
                      {t("bgpAnnouncements.approveRollback")}
                    </Button>
                    <Button variant="destructive" onClick={() => void rejectRollbackMutation.mutateAsync(selectedRollback.id)} disabled={rejectRollbackMutation.isPending}>
                      {t("bgpAnnouncements.rejectRollback")}
                    </Button>
                  </>
                ) : null}
                {selectedRollback?.status === "approved" && canOperateBgpAnnouncements ? (
                  <>
                    <Button onClick={() => void rollbackDryRunMutation.mutateAsync(selectedRollback.id)} disabled={rollbackDryRunMutation.isPending}>
                      {t("bgpAnnouncements.rollbackDryRun")}
                    </Button>
                    <Badge variant="outline">{t("bgpAnnouncements.rollbackRealBlocked")}</Badge>
                  </>
                ) : null}
                {selectedRollback?.status === "dry_run_succeeded" && canOperateBgpAnnouncements ? (
                  <Button onClick={() => void rollbackPostcheckMutation.mutateAsync(selectedRollback.id)} disabled={rollbackPostcheckMutation.isPending}>
                    {t("bgpAnnouncements.rollbackPostcheck")}
                  </Button>
                ) : null}
                {selectedRollback?.status === "dry_run_succeeded" ? (
                  <Alert className="border-amber-500/30 bg-amber-500/10">
                    <Clock3 className="h-4 w-4" />
                    <AlertDescription>
                      {t("bgpAnnouncements.rollbackDryRun")} OK. Execução real ainda está desabilitada neste ambiente.
                    </AlertDescription>
                  </Alert>
                ) : null}
                {selectedPlan.status === "dry_run_succeeded" ? (
                  <Alert className="border-emerald-500/30 bg-emerald-500/10">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t("bgpAnnouncements.dryRunOk")}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
