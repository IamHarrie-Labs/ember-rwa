/// Countdowns are read at a glance under time pressure, so they stay short and fixed-width.
export function duration(seconds: number): string {
  if (seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/// "how long a proof lasts" — coarser than a countdown, never ticking.
export function burnLabel(seconds: number): string {
  if (seconds >= 3600) {
    const h = seconds / 3600;
    return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
  }
  if (seconds >= 60) return `${Math.round(seconds / 60)}m`;
  return `${seconds}s`;
}

export function ago(unixSeconds: number, now = Date.now()): string {
  const delta = Math.max(0, Math.floor(now / 1000) - unixSeconds);
  return `${duration(delta)} ago`;
}

export const shortHash = (h: string, lead = 6, tail = 4) =>
  h.length <= lead + tail + 2 ? h : `${h.slice(0, lead)}…${h.slice(-tail)}`;

export const shortAddress = (a: string) => shortHash(a, 6, 4);
