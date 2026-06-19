import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useListDevices } from "@workspace/api-client-react";
import { Bot, Building2, GraduationCap, Loader2, Send, Sparkles, ThumbsDown, ThumbsUp, User, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  askCopilot,
  listCopilotSkills,
  sendCopilotFeedback,
  type CopilotAskResponse,
  type CopilotResponseMode,
} from "./copilot-api";
import { cn } from "@/lib/utils";

type ChatMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string; meta?: CopilotAskResponse; userQuestion?: string };

const DEFAULT_TENANT_ID = 1;

const SUGGESTIONS = [
  "Como esta o peering do Google na CDN?",
  "O prefixo 200.1.2.0/24 esta sendo exportado para a Vivo?",
  "Por que o bloco do cliente nao esta saindo para a operadora?",
  "Explique a route-policy RP-CLIENTE-IN",
  "O que mudou nos peers BGP desde ontem?",
  "Quais achados de compliance fail no escopo?",
  "Circuitos L2 com VSI_DOWN ou PW_PARTIAL_DOWN?",
];

function renderAnswer(text: string) {
  const blocks = text.split(/```/);
  return blocks.map((block, index) => {
    if (index % 2 === 1) {
      return (
        <pre key={index} className="my-2 overflow-x-auto rounded-md bg-muted p-2 text-xs">
          {block.trim()}
        </pre>
      );
    }

    return block.split("\n").map((line, lineIndex) => {
      if (line.startsWith("### ")) {
        return <h4 key={`${index}-${lineIndex}`} className="mt-3 text-sm font-semibold">{line.slice(4)}</h4>;
      }
      const html = line
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+)`/g, "<code class='rounded bg-muted px-1 py-0.5 text-xs'>$1</code>");
      if (!line.trim()) return <br key={`${index}-${lineIndex}`} />;
      return <p key={`${index}-${lineIndex}`} className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
    });
  });
}

export function CopilotChat() {
  const [question, setQuestion] = useState("");
  const [deviceId, setDeviceId] = useState<string>("company");
  const [mode, setMode] = useState<CopilotResponseMode>("technical");
  const [sessionId, setSessionId] = useState<number | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [teachOpen, setTeachOpen] = useState(false);
  const [teachTarget, setTeachTarget] = useState<{ messageId: number; question: string } | null>(null);
  const [teachAlias, setTeachAlias] = useState("");
  const [teachCanonical, setTeachCanonical] = useState("");
  const devicesQuery = useListDevices();
  const skillsQuery = useQuery({
    queryKey: ["copilot-skills"],
    queryFn: listCopilotSkills,
    staleTime: 60_000,
  });

  const feedback = useMutation({
    mutationFn: sendCopilotFeedback,
  });

  const ask = useMutation({
    mutationFn: (payload: { question: string; deviceId?: number; mode?: CopilotResponseMode; sessionId?: number }) =>
      askCopilot(payload),
    onSuccess: (result, variables) => {
      if (result.sessionId) setSessionId(result.sessionId);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: result.answer,
          meta: result,
          userQuestion: variables.question,
        },
      ]);
    },
  });

  const deviceOptions = useMemo(
    () => devicesQuery.data ?? [],
    [devicesQuery.data],
  );

  const submit = (value?: string) => {
    const text = (value ?? question).trim();
    if (!text || ask.isPending) return;

    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", content: text }]);
    setQuestion("");

    ask.mutate({
      question: text,
      deviceId: deviceId === "company" ? undefined : Number(deviceId),
      mode,
      sessionId,
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="min-h-[560px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            NetOps Co-pilot
          </CardTitle>
          <CardDescription>
            Camada operacional read-only: interpreta a pergunta, executa tools deterministicas e responde com evidencias auditaveis.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex h-full flex-col gap-4">
          <div className="flex-1 space-y-4 overflow-y-auto rounded-md border bg-muted/10 p-4 min-h-[360px]">
            {messages.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Exemplo: &quot;Como esta o peering do Google?&quot; — agrega todos os devices da mesma empresa/tenant e resume estado consolidado.
              </div>
            ) : null}

            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                {message.role === "assistant" ? <Bot className="mt-1 h-4 w-4 shrink-0 text-sky-400" /> : null}
                <div
                  className={cn(
                    "max-w-[90%] rounded-lg px-3 py-2",
                    message.role === "user" ? "bg-primary text-primary-foreground" : "bg-background border",
                  )}
                >
                  {message.role === "assistant" ? renderAnswer(message.content) : (
                    <p className="text-sm">{message.content}</p>
                  )}
                  {message.role === "assistant" && message.meta ? (
                    <div className="mt-2 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{message.meta.intent}</Badge>
                        <Badge variant="secondary">{message.meta.mode}</Badge>
                        <Badge variant="secondary">{message.meta.confidence}</Badge>
                        {message.meta.evidence.scope.deviceCount > 0 ? (
                          <Badge variant="outline" className="gap-1">
                            <Building2 className="h-3 w-3" />
                            {message.meta.evidence.scope.label} ({message.meta.evidence.scope.deviceCount})
                          </Badge>
                        ) : null}
                        {message.meta.evidence.toolRuns.map((run) => (
                          <Badge key={`${run.toolName}-${run.durationMs}`} variant="outline" className="gap-1 text-[10px]">
                            <Sparkles className="h-3 w-3" />
                            {run.toolName}
                          </Badge>
                        ))}
                        {message.meta.evidence.diagnosticTrail?.length > 0 ? (
                          <Badge variant="outline">
                            {message.meta.evidence.diagnosticTrail.filter((s) => s.status === "fail").length} falha(s) diag.
                          </Badge>
                        ) : null}
                        {message.meta.evidence.toolRuns.some((run) => run.toolName === "bgp_route_ssh_live" && run.status === "ok") ? (
                          <Badge variant="outline">SSH live</Badge>
                        ) : null}
                        {message.meta.evidence.toolRuns.some((run) => run.toolName === "netops_inventory_refresh" && run.status === "ok") ? (
                          <Badge variant="outline">SNMP refresh</Badge>
                        ) : null}
                        {message.meta.evidence.toolRuns.some((run) => run.toolName === "netbox_inventory_query" && run.status === "ok") ? (
                          <Badge variant="outline">NetBox</Badge>
                        ) : null}
                        {message.meta.evidence.nlu?.used ? (
                          <Badge variant="outline" className="gap-1">
                            NLU {message.meta.evidence.nlu.confidence != null
                              ? `${Math.round(message.meta.evidence.nlu.confidence * 100)}%`
                              : ""}
                          </Badge>
                        ) : message.meta.evidence.nlu?.ambiguous ? (
                          <Badge variant="outline">ambiguo (regex)</Badge>
                        ) : null}
                        {message.meta.evidence.matrixTimelapse?.length > 0 ? (
                          <Badge variant="outline">timelapse</Badge>
                        ) : null}
                        {(message.meta.evidence.complianceFindings?.length ?? 0) > 0 ? (
                          <Badge variant="outline">
                            {message.meta.evidence.complianceFindings!.length} compliance
                          </Badge>
                        ) : null}
                        {(message.meta.evidence.l2Findings?.length ?? 0) > 0 ? (
                          <Badge variant="outline">
                            {message.meta.evidence.l2Findings!.length} L2 finding(s)
                          </Badge>
                        ) : null}
                        {message.meta.evidence.configHints.length > 0 ? (
                          <Badge variant="outline" className="gap-1">
                            <Wrench className="h-3 w-3" />
                            {message.meta.evidence.configHints.length} dica(s)
                          </Badge>
                        ) : null}
                      </div>
                      {message.meta.messageId ? (
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            disabled={feedback.isPending}
                            onClick={() => feedback.mutate({ messageId: message.meta!.messageId!, rating: "useful" })}
                          >
                            <ThumbsUp className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            disabled={feedback.isPending}
                            onClick={() => feedback.mutate({
                              messageId: message.meta!.messageId!,
                              rating: "incorrect",
                              question: message.userQuestion,
                              tenantId: DEFAULT_TENANT_ID,
                            })}
                          >
                            <ThumbsDown className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            disabled={feedback.isPending}
                            onClick={() => {
                              setTeachTarget({
                                messageId: message.meta!.messageId!,
                                question: message.userQuestion ?? "",
                              });
                              setTeachAlias("");
                              setTeachCanonical("");
                              setTeachOpen(true);
                            }}
                          >
                            <GraduationCap className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {message.role === "user" ? <User className="mt-1 h-4 w-4 shrink-0" /> : null}
              </div>
            ))}

            {ask.isPending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Consultando inventario...
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={deviceId} onValueChange={setDeviceId}>
                <SelectTrigger className="sm:w-72">
                  <SelectValue placeholder="Escopo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Empresa (todos devices do tenant)</SelectItem>
                  {deviceOptions.map((device) => (
                    <SelectItem key={device.id} value={String(device.id)}>
                      Anchor: {device.hostname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={mode} onValueChange={(value) => setMode(value as CopilotResponseMode)}>
                <SelectTrigger className="sm:w-48">
                  <SelectValue placeholder="Modo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quick">Rapida (NOC)</SelectItem>
                  <SelectItem value="technical">Tecnica</SelectItem>
                  <SelectItem value="diagnostic">Diagnostico</SelectItem>
                  <SelectItem value="action">Plano de acao</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Pergunte sobre peering, prefixos, circuitos ou como configurar..."
              rows={3}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
            />

            <div className="flex justify-end">
              <Button type="button" onClick={() => submit()} disabled={ask.isPending || question.trim().length === 0}>
                {ask.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Perguntar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sugestoes</CardTitle>
            <CardDescription>Consultas e dicas de config (read-only).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {SUGGESTIONS.map((suggestion) => (
              <Button
                key={suggestion}
                type="button"
                variant="outline"
                className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left text-xs"
                onClick={() => {
                  setQuestion(suggestion);
                  submit(suggestion);
                }}
              >
                {suggestion}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Habilidades</CardTitle>
            <CardDescription>Registry extensivel — agentes podem registrar novas skills.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {skillsQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Carregando...</p>
            ) : null}
            {(skillsQuery.data?.skills ?? []).map((skill) => (
              <div key={skill.id} className="rounded-md border px-3 py-2">
                <p className="text-xs font-medium">{skill.name}</p>
                <p className="text-[11px] text-muted-foreground">{skill.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
