import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useListDevices } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ArrowLeft } from "lucide-react";
import { BgpPeerDrilldownView, useBgpPeerDrilldown } from "@/features/bgp-drilldown";

function readInitialQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    deviceId: params.get("deviceId") ?? params.get("device_id") ?? "",
    peer: params.get("peer") ?? params.get("peerIp") ?? "172.28.1.138",
    auto: params.get("auto") === "1" || params.has("deviceId"),
  };
}

export default function BgpPeerDrilldownPage() {
  const initial = useMemo(() => readInitialQuery(), []);
  const [deviceId, setDeviceId] = useState(initial.deviceId);
  const [peer, setPeer] = useState(initial.peer);
  const [submitted, setSubmitted] = useState<{ deviceId: number; peer: string } | null>(null);

  const { data: devices = [] } = useListDevices();

  useEffect(() => {
    if (initial.auto && initial.deviceId && initial.peer) {
      const id = Number(initial.deviceId);
      if (id > 0) {
        setSubmitted({ deviceId: id, peer: initial.peer });
      }
    }
  }, [initial.auto, initial.deviceId, initial.peer]);

  const query = useBgpPeerDrilldown({
    deviceId: submitted?.deviceId ?? 0,
    peer: submitted?.peer ?? "",
    source: "snapshot",
    includePolicies: true,
    includePolicyObjects: true,
    enabled: Boolean(submitted),
  });

  function handleConsultar() {
    const id = Number(deviceId);
    const peerVal = peer.trim();
    if (!id || !peerVal) return;
    setSubmitted({ deviceId: id, peer: peerVal });
    const url = new URL(window.location.href);
    url.searchParams.set("deviceId", String(id));
    url.searchParams.set("peer", peerVal);
    window.history.replaceState({}, "", url.pathname + url.search);
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/netops-operations">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            NetOps
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">BGP Peer Drilldown</h1>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge variant="outline">Source: snapshot</Badge>
            <Badge variant="outline">Read-only</Badge>
            <Badge variant="outline">Sem comandos no equipamento</Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consulta</CardTitle>
          <CardDescription>GET /api/bgp/peers/:deviceId/:peer/drilldown?source=snapshot</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-4 md:items-end">
          <div className="flex-1 space-y-2">
            <Label>Device</Label>
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o device" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.hostname} (#{d.id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-2">
            <Label>Peer (IP ou nome)</Label>
            <Input
              value={peer}
              onChange={(e) => setPeer(e.target.value)}
              placeholder="172.28.1.138"
              className="font-mono"
            />
          </div>
          <Button type="button" onClick={handleConsultar} disabled={!deviceId || !peer.trim()}>
            <Search className="h-4 w-4 mr-2" />
            Consultar
          </Button>
        </CardContent>
      </Card>

      <BgpPeerDrilldownView
        data={query.data}
        loading={query.isFetching && Boolean(submitted)}
        error={query.error}
      />
    </div>
  );
}
