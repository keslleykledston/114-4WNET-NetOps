import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

async function apiFetch<T>(path: string) {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

interface ServiceItem {
  id: number;
  name: string;
  description?: string;
  icon?: string;
}

export default function ServiceCatalogPage() {
  const { data: catalog } = useQuery({
    queryKey: ["service-catalog"],
    queryFn: () => apiFetch<ServiceItem[]>("/api/service-catalog"),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Service Catalog</h1>
      <div className="grid grid-cols-3 gap-4">
        {catalog?.map((item) => (
          <Card key={item.id} className="hover:shadow-lg cursor-pointer">
            <CardContent className="pt-6 text-center">
              <div className="text-5xl mb-2">{item.icon || "⚙️"}</div>
              <h3 className="font-semibold">{item.name}</h3>
              <p className="text-xs text-muted-foreground mt-2">{item.description}</p>
              <Button size="sm" className="mt-4 w-full">
                Request
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
