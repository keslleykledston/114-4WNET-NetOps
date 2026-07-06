import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import {
  fetchResourcePools,
  fetchAllocations,
  fetchCollisions,
  getPoolUsage,
} from "@/features/resource-manager/resource-manager-api";

export default function ResourceManager() {
  const { t } = useTranslation();
  const [pools, setPools] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [collisions, setCollisions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [p, a, c] = await Promise.all([
        fetchResourcePools(),
        fetchAllocations(),
        fetchCollisions(),
      ]);
      setPools(p);
      setAllocations(a);
      setCollisions(c);
    } catch (error) {
      console.error("Error loading resource manager data:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="p-0">{t("common.loading")}...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{t("resourceManager.title")}</h1>
        <Button onClick={loadData}>{t("common.refresh")}</Button>
      </div>

      <Tabs defaultValue="pools" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pools">{t("resourceManager.pools")}</TabsTrigger>
          <TabsTrigger value="allocations">{t("resourceManager.allocations")}</TabsTrigger>
          <TabsTrigger value="reservations">{t("resourceManager.reservations")}</TabsTrigger>
          <TabsTrigger value="collisions">{t("resourceManager.collisions")}</TabsTrigger>
        </TabsList>

        <TabsContent value="pools" className="space-y-4 mt-6">
          {pools.map((pool) => (
            <PoolCard key={pool.id} pool={pool} />
          ))}
          {pools.length === 0 && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground">{t("resourceManager.noPools")}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="allocations" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("resourceManager.allocationsTitle")}</CardTitle>
              <CardDescription>{t("resourceManager.allocationsCount", { count: allocations.length })}</CardDescription>
            </CardHeader>
            <CardContent>
              {allocations.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">{t("common.type")}</th>
                      <th className="text-left py-2">{t("common.value")}</th>
                      <th className="text-left py-2">{t("devices.title")}</th>
                      <th className="text-left py-2">{t("common.status")}</th>
                      <th className="text-left py-2">{t("common.date")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.slice(0, 20).map((alloc) => (
                      <tr key={alloc.id} className="border-b">
                        <td className="py-2">{alloc.resourceType}</td>
                        <td className="py-2 font-mono">{alloc.resourceValue}</td>
                        <td className="py-2">{alloc.deviceId || "-"}</td>
                        <td className="py-2">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              alloc.status === "ALLOCATED"
                                ? "bg-green-100 text-green-800"
                                : alloc.status === "RESERVED"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {alloc.status}
                          </span>
                        </td>
                        <td className="py-2">{new Date(alloc.allocatedAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-muted-foreground">{t("resourceManager.noAllocations")}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reservations" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("resourceManager.reservationsTitle")}</CardTitle>
              <CardDescription>{t("resourceManager.reservationsDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t("resourceManager.reservationsComingSoon")}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="collisions" className="space-y-4 mt-6">
          {collisions.length > 0 ? (
            collisions.map((collision, idx) => (
              <Card key={idx} className="border-red-200 bg-red-50">
                <CardHeader>
                  <CardTitle className="text-red-800">{collision.type}</CardTitle>
                  <CardDescription>{collision.message}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-semibold">{t("resourceManager.value")}</p>
                      <p className="font-mono">{collision.value}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{t("compliance.severity")}</p>
                      <p
                        className={
                          collision.severity === "CRITICAL"
                            ? "text-red-600 font-bold"
                            : "text-yellow-600 font-bold"
                        }
                      >
                        {collision.severity}
                      </p>
                    </div>
                  </div>
                  {collision.devices.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-semibold">{t("resourceManager.devices")}</p>
                      <p className="text-sm">{collision.devices.join(", ")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="text-green-600 font-semibold">{t("resourceManager.noCollisions")}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PoolCard({ pool }: { pool: any }) {
  const { t } = useTranslation();
  const [usage, setUsage] = useState<any>(null);

  useEffect(() => {
    getPoolUsage(pool.id).then(setUsage).catch(console.error);
  }, [pool.id]);

  if (!usage) return <div>{t("common.loading")}...</div>;

  const percentage = ((usage.allocated + usage.reserved) / usage.total) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{pool.name}</CardTitle>
        <CardDescription>{pool.resourceType}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>{t("resourceManager.total")}</span>
            <span className="font-semibold">{usage.total}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>{t("resourceManager.allocated")}</span>
            <span className="font-semibold text-green-600">{usage.allocated}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>{t("resourceManager.reserved")}</span>
            <span className="font-semibold text-blue-600">{usage.reserved}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>{t("resourceManager.available")}</span>
            <span className="font-semibold">{usage.available}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
            <div
              className="bg-blue-600 h-2 rounded-full"
              style={{ width: `${percentage}%` }}
            ></div>
          </div>
          <p className="text-xs text-muted-foreground">{t("resourceManager.percentUsed", { percent: percentage.toFixed(1) })}</p>
        </div>
      </CardContent>
    </Card>
  );
}
