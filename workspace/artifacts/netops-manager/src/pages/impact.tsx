import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  fetchImpactSummary,
  fetchScenarios,
  acknowledgeScenario,
  resolveScenario,
} from "@/features/impact/impact-api";

export default function ImpactAnalysis() {
  const [summary, setSummary] = useState<any>(null);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [s, sc] = await Promise.all([fetchImpactSummary(), fetchScenarios()]);
      setSummary(s);
      setScenarios(sc);
    } catch (error) {
      console.error("Error loading impact data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAck(scenarioId: number) {
    try {
      await acknowledgeScenario(scenarioId);
      await loadData();
    } catch (error) {
      console.error("Error acknowledging scenario:", error);
    }
  }

  async function handleResolve(scenarioId: number) {
    try {
      await resolveScenario(scenarioId);
      await loadData();
    } catch (error) {
      console.error("Error resolving scenario:", error);
    }
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Impact Analysis</h1>
        <Button onClick={loadData}>Refresh</Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
          <TabsTrigger value="correlation">Service Correlation</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-4 mt-6">
          {summary ? (
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Total Scenarios</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{summary.totalScenarios || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Open</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-red-600">{summary.openScenarios || 0}</p>
                </CardContent>
              </Card>
              <Card className="border-red-200 bg-red-50">
                <CardHeader>
                  <CardTitle className="text-lg text-red-800">Critical</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-red-600">{summary.criticalScenarios || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Affected Services</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{summary.affectedServices || 0}</p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground">No impact data available</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* SCENARIOS TAB */}
        <TabsContent value="scenarios" className="space-y-4 mt-6">
          {scenarios.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Impact Scenarios</CardTitle>
                <CardDescription>{scenarios.length} scenarios</CardDescription>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Target</th>
                      <th className="text-left py-2">Status</th>
                      <th className="text-left py-2">Severity</th>
                      <th className="text-left py-2">Affected</th>
                      <th className="text-left py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((scenario) => (
                      <tr key={scenario.id} className="border-b">
                        <td className="py-2">{scenario.targetLabel}</td>
                        <td className="py-2">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              scenario.status === "OPEN"
                                ? "bg-red-100 text-red-800"
                                : scenario.status === "ACKNOWLEDGED"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-green-100 text-green-800"
                            }`}
                          >
                            {scenario.status}
                          </span>
                        </td>
                        <td className="py-2">
                          <span
                            className={
                              scenario.severity === "CRITICAL"
                                ? "text-red-600 font-bold"
                                : "text-yellow-600"
                            }
                          >
                            {scenario.severity}
                          </span>
                        </td>
                        <td className="py-2">{scenario.affectedCount}</td>
                        <td className="py-2 space-x-2">
                          {scenario.status === "OPEN" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAck(scenario.id)}
                              >
                                Ack
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleResolve(scenario.id)}
                              >
                                Resolve
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="text-green-600 font-semibold">✓ No impact scenarios</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* SERVICE CORRELATION TAB */}
        <TabsContent value="correlation" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Service Correlation</CardTitle>
              <CardDescription>Services affected by scenarios</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Service correlation details coming soon
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
