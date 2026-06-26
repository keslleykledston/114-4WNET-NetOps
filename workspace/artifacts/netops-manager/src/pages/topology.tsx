import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  fetchTopologySummary,
  fetchOrphans,
  fetchOrphansSummary,
  rebuildTopology,
} from "@/features/topology/topology-api";

export default function Topology() {
  const [summary, setSummary] = useState<any>(null);
  const [orphans, setOrphans] = useState<any[]>([]);
  const [orphansSummary, setOrphansSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [s, o, os] = await Promise.all([
        fetchTopologySummary(),
        fetchOrphans(),
        fetchOrphansSummary(),
      ]);
      setSummary(s);
      setOrphans(o);
      setOrphansSummary(os);
    } catch (error) {
      console.error("Error loading topology:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleRebuild() {
    try {
      setRebuilding(true);
      await rebuildTopology();
      await loadData();
    } catch (error) {
      console.error("Error rebuilding topology:", error);
    } finally {
      setRebuilding(false);
    }
  }

  if (loading) {
    return <div className="p-0">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Topology Intelligence</h1>
          <p className="text-sm text-muted-foreground">Grafo analítico do inventário (separado do mapa manual)</p>
        </div>
        <Button onClick={handleRebuild} disabled={rebuilding}>
          {rebuilding ? "Rebuilding..." : "Rebuild"}
        </Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="orphans">Orphans</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-4">
          {summary ? (
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-lg">Devices</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{summary.deviceCount || 0}</p></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-lg">Interfaces</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{summary.interfaceCount || 0}</p></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-lg">BGP Peers</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{summary.bgpPeerCount || 0}</p></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-lg">L2 Circuits</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{summary.l2CircuitCount || 0}</p></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-lg">Nodes</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{summary.totalNodes || 0}</p></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-lg">Edges</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{summary.totalEdges || 0}</p></CardContent>
              </Card>
            </div>
          ) : (
            <Card><CardContent className="pt-6"><p className="text-muted-foreground">No topology data</p></CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="devices" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Device Topology</CardTitle>
              <CardDescription>Detalhes por dispositivo via API</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Use o mapa manual em /map para desenhar topologia visual.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orphans" className="mt-6 space-y-4">
          {orphansSummary && orphansSummary.totalOrphans > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Orphans</CardTitle>
                <CardDescription>{orphansSummary.totalOrphans} orphaned nodes</CardDescription>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 text-left">Type</th>
                      <th className="py-2 text-left">Label</th>
                      <th className="py-2 text-left">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orphans.map((orphan) => (
                      <tr key={orphan.id} className="border-b">
                        <td className="py-2 font-mono text-xs">{orphan.nodeType}</td>
                        <td className="py-2">{orphan.label}</td>
                        <td className="py-2 text-xs">{orphan.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : (
            <Card><CardContent className="pt-6"><p className="font-semibold text-emerald-500">Sem órfãos</p></CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
