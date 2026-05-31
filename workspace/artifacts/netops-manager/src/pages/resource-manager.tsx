import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  fetchResourcePools,
  fetchAllocations,
  fetchCollisions,
  fetchCollisionReport,
  getPoolUsage,
  createResourcePool,
  allocateResource,
  releaseResource,
} from "@/features/resource-manager/resource-manager-api";

export default function ResourceManager() {
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
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Resource Manager</h1>
        <Button onClick={loadData}>Refresh</Button>
      </div>

      <Tabs defaultValue="pools" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pools">Pools</TabsTrigger>
          <TabsTrigger value="allocations">Allocations</TabsTrigger>
          <TabsTrigger value="reservations">Reservations</TabsTrigger>
          <TabsTrigger value="collisions">Collisions</TabsTrigger>
        </TabsList>

        {/* POOLS TAB */}
        <TabsContent value="pools" className="space-y-4 mt-6">
          {pools.map((pool) => (
            <PoolCard key={pool.id} pool={pool} />
          ))}
          {pools.length === 0 && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground">No resource pools configured</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ALLOCATIONS TAB */}
        <TabsContent value="allocations" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Allocations</CardTitle>
              <CardDescription>{allocations.length} resources allocated</CardDescription>
            </CardHeader>
            <CardContent>
              {allocations.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Type</th>
                      <th className="text-left py-2">Value</th>
                      <th className="text-left py-2">Device</th>
                      <th className="text-left py-2">Status</th>
                      <th className="text-left py-2">Date</th>
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
                <p className="text-muted-foreground">No allocations</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* RESERVATIONS TAB */}
        <TabsContent value="reservations" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Reservations</CardTitle>
              <CardDescription>Temporary resource holds</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Reservation management coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* COLLISIONS TAB */}
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
                      <p className="text-sm font-semibold">Value</p>
                      <p className="font-mono">{collision.value}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Severity</p>
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
                      <p className="text-sm font-semibold">Devices</p>
                      <p className="text-sm">{collision.devices.join(", ")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="text-green-600 font-semibold">✓ No resource collisions detected</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PoolCard({ pool }: { pool: any }) {
  const [usage, setUsage] = useState<any>(null);

  useEffect(() => {
    getPoolUsage(pool.id).then(setUsage).catch(console.error);
  }, [pool.id]);

  if (!usage) return <div>Loading...</div>;

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
            <span>Total</span>
            <span className="font-semibold">{usage.total}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Allocated</span>
            <span className="font-semibold text-green-600">{usage.allocated}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Reserved</span>
            <span className="font-semibold text-blue-600">{usage.reserved}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Available</span>
            <span className="font-semibold">{usage.available}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
            <div
              className="bg-blue-600 h-2 rounded-full"
              style={{ width: `${percentage}%` }}
            ></div>
          </div>
          <p className="text-xs text-muted-foreground">{percentage.toFixed(1)}% used</p>
        </div>
      </CardContent>
    </Card>
  );
}
