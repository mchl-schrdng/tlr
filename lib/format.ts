// Display helpers shared across pages. Pure functions.

export function fmtDistanceKm(meters: number): string {
  return (meters / 1000).toFixed(2) + " km";
}

export function fmtDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// Pace from speed (m/s) -> "m:ss /km". Returns "—" for non-moving.
export function fmtPaceFromSpeed(metersPerSec: number | null | undefined): string {
  if (!metersPerSec || metersPerSec <= 0) return "—";
  return fmtPaceFromSecPerKm(1000 / metersPerSec);
}

export function fmtPaceFromSecPerKm(secPerKm: number): string {
  if (!isFinite(secPerKm) || secPerKm <= 0) return "—";
  const totalSeconds = Math.round(secPerKm);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
