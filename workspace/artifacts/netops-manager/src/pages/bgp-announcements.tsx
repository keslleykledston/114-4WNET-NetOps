import { useEffect } from "react";
import { useLocation } from "wouter";

export default function BgpAnnouncementsPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deviceId = params.get("deviceId") ?? params.get("device_id");
    const qs = new URLSearchParams({ view: "bgp-announcements" });
    if (deviceId) qs.set("deviceId", deviceId);
    setLocation(`/netops-operations?${qs.toString()}`);
  }, [setLocation]);

  return (
    <div className="p-6 text-sm text-muted-foreground">
      Redirecionando para NetOps Operations…
    </div>
  );
}
