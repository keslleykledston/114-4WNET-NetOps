function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatSeconds(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const remainderAfterDays = totalSeconds % 86400;
  const hours = Math.floor(remainderAfterDays / 3600);
  const remainderAfterHours = remainderAfterDays % 3600;
  const minutes = Math.floor(remainderAfterHours / 60);
  const seconds = remainderAfterHours % 60;

  return `${pad(days)} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function parseHuaweiDuration(value: string): number | null {
  const compact = value.trim();
  if (!compact) return null;

  if (/^\d+$/.test(compact)) {
    return Number(compact);
  }

  const huaweiMatch = compact.match(/^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (huaweiMatch) {
    const days = Number(huaweiMatch[1] ?? 0);
    const hours = Number(huaweiMatch[2] ?? 0);
    const minutes = Number(huaweiMatch[3] ?? 0);
    const seconds = Number(huaweiMatch[4] ?? 0);
    return (days * 86400) + (hours * 3600) + (minutes * 60) + seconds;
  }

  const clockMatch = compact.match(/^(?:(\d+):)?(\d{1,2}):(\d{2}):(\d{2})$/);
  if (clockMatch) {
    const days = Number(clockMatch[1] ?? 0);
    const hours = Number(clockMatch[2]);
    const minutes = Number(clockMatch[3]);
    const seconds = Number(clockMatch[4]);
    return (days * 86400) + (hours * 3600) + (minutes * 60) + seconds;
  }

  const hhmmssMatch = compact.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hhmmssMatch) {
    const hours = Number(hhmmssMatch[1]);
    const minutes = Number(hhmmssMatch[2]);
    const seconds = Number(hhmmssMatch[3]);
    return (hours * 3600) + (minutes * 60) + seconds;
  }

  return null;
}

export function formatBgpUptime(value: string | null | undefined): string {
  if (!value) return "—";

  const parsed = parseHuaweiDuration(value);
  if (parsed == null || Number.isNaN(parsed)) {
    return value;
  }

  return formatSeconds(parsed);
}
