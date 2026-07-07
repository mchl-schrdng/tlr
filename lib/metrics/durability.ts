import type { ActivityRow, StreamSet } from "@/lib/db";

// Durability = fatigue resistance. Fresh legs are easy; races are won late.
// For a single run we split the moving time into quarters and compare aerobic
// efficiency (speed per heartbeat) in the final quarter vs the first quarter.
// A small fade means your engine holds; a big fade means you decouple late —
// the single best predictor of marathon/ultra performance, and something free
// tools rarely surface.

type Q = { dist: number; time: number; hrSum: number; hrTime: number };

// Efficiency factor (metres per second per bpm) for a quarter, or null.
function ef(q: Q): number | null {
  if (q.time <= 0 || q.hrTime <= 0) return null;
  const speed = q.dist / q.time;
  const hr = q.hrSum / q.hrTime;
  return hr > 0 ? speed / hr : null;
}

export type RunFade = { earlyEf: number; lateEf: number; fadePct: number };

// Fade from first to last quarter of one run. Positive fadePct = slowed per
// heartbeat (faded). null if the run lacks HR or is too short to split.
export function runFade(s: StreamSet): RunFade | null {
  const time = s.time;
  const dist = s.distance;
  const hr = s.heartrate;
  if (!time || !dist || !hr || time.length < 8) return null;
  const total = time[time.length - 1] - time[0];
  if (total <= 0) return null;

  const quarters: Q[] = [
    { dist: 0, time: 0, hrSum: 0, hrTime: 0 },
    { dist: 0, time: 0, hrSum: 0, hrTime: 0 },
    { dist: 0, time: 0, hrSum: 0, hrTime: 0 },
    { dist: 0, time: 0, hrSum: 0, hrTime: 0 },
  ];
  for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1];
    const dd = dist[i] - dist[i - 1];
    if (dt <= 0 || dd < 0) continue;
    const elapsed = time[i - 1] - time[0];
    const qi = Math.min(3, Math.floor((elapsed / total) * 4));
    const q = quarters[qi];
    q.dist += dd;
    q.time += dt;
    if (hr[i] != null && hr[i - 1] != null) {
      q.hrSum += ((hr[i] + hr[i - 1]) / 2) * dt;
      q.hrTime += dt;
    }
  }
  const earlyEf = ef(quarters[0]);
  const lateEf = ef(quarters[3]);
  if (earlyEf == null || lateEf == null || earlyEf <= 0) return null;
  return { earlyEf, lateEf, fadePct: ((earlyEf - lateEf) / earlyEf) * 100 };
}

export type Durability = {
  runs: number;
  medianFadePct: number | null;
  rating: "excellent" | "good" | "moderate" | "poor" | "unknown";
};

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function rate(fade: number | null): Durability["rating"] {
  if (fade == null) return "unknown";
  if (fade < 3) return "excellent";
  if (fade < 6) return "good";
  if (fade < 10) return "moderate";
  return "poor";
}

// Aggregate durability over recent long-enough runs (default ≥ 40 min moving).
export function durabilitySummary(
  activities: ActivityRow[],
  getStream: (id: number) => StreamSet | null,
  minMovingSec = 2400,
  limit = 10,
): Durability {
  const fades: number[] = [];
  for (const a of activities) {
    if (fades.length >= limit) break;
    if (a.moving_time < minMovingSec) continue;
    const s = getStream(a.id);
    if (!s) continue;
    const f = runFade(s);
    if (f) fades.push(f.fadePct);
  }
  const med = median(fades);
  return { runs: fades.length, medianFadePct: med, rating: rate(med) };
}
