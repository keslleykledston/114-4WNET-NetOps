import { useState, useEffect } from "react";
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

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
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
  }

  async function handleRebuild() {
    try {
      setLoading(true);
      await rebuildTopology();
      await loadData();
    } catch (error) {
      console.error("Error rebuilding topology:", error);
    }
  }

  if (loading) {
    return <div className="p-0">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Topology Intelligence</h1>
        <Button onClick={handleRebuild}>Rebuild</Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="orphans">Orphans</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-4 mt-6">
          {summary ? (
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Devices</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{summary.deviceCount || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Interfaces</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{summary.interfaceCount || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">BGP Peers</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{summary.bgpPeerCount || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">L2 Circuits</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{summary.l2CircuitCount || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Nodes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{summary.totalNodes || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Edges</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{summary.totalEdges || 0}</p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground">No topology data available</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* DEVICES TAB */}
        <TabsContent value="devices" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Device Topology</CardTitle>
              <CardDescription>Devices in network</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Device topology details coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ORPHANS TAB */}
        <TabsContent value="orphans" className="space-y-4 mt-6">
          {orphansSummary && orphansSummary.totalOrphans > 0 ? (
            <div className="space-y-4">
              <Card className="border-amber-200 bg-amber-50">
                <CardHeader>
                  <CardTitle className="text-amber-800">Orphans Detected</CardTitle>
                  <CardDescription>{orphansSummary.totalOrphans} orphaned nodes</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(orphansSummary.byType as Record<string, number>).map(([type, count]) => (
                      <div key={type}>
                        <p className="text-sm font-semibold">{type}</p>
                        <p className="text-2xl font-bold">{count}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Orphan Nodes</CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Type</th>
                        <th className="text-left py-2">Label</th>
                        <th className="text-left py-2">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orphans.map((orphan) => (
                        <tr key={orphan.id} className="border-b">
                          <td className="py-2 text-xs font-mono">{orphan.nodeType}</td>
                          <td className="py-2">{orphan.label}</td>
                          <td className="py-2 text-xs">{orphan.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="text-green-600 font-semibold">✓ No orphans detected</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
