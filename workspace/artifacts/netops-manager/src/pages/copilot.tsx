import { CopilotAliasesPanel } from "@/features/copilot/copilot-aliases-panel";
import { CopilotChat } from "@/features/copilot/copilot-chat";

export default function CopilotPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Copiloto IA</h1>
        <p className="text-muted-foreground">
          Consultas read-only sobre peering BGP, anuncios de clientes e circuitos L2.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <CopilotChat />
        <CopilotAliasesPanel />
      </div>
    </div>
  );
}
