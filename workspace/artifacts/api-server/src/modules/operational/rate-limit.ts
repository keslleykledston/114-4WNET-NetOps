const lastCollectAtByDevice = new Map<number, number>();

function rateLimitMs(): number {
  const minutes = Number(process.env["SNMP_FAST_RATE_LIMIT_MINUTES"] ?? 5);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 5) * 60 * 1000;
}

export function checkSnmpFastRateLimit(deviceId: number): { allowed: boolean; retryAfterSec?: number } {
  const last = lastCollectAtByDevice.get(deviceId);
  if (!last) return { allowed: true };
  const elapsed = Date.now() - last;
  const windowMs = rateLimitMs();
  if (elapsed >= windowMs) return { allowed: true };
  return { allowed: false, retryAfterSec: Math.ceil((windowMs - elapsed) / 1000) };
}

export function recordSnmpFastCollect(deviceId: number): void {
  lastCollectAtByDevice.set(deviceId, Date.now());
}
