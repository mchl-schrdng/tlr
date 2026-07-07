import type { StreamSet } from "@/lib/db";

// Power-duration curve for running: your best sustained estimated power for a set
// of durations (5s → 20min), across all runs. It is the running analogue of a
// cyclist's mean-max power curve and the Stryd-style complement to critical speed
// — a season-over-season fingerprint of neuromuscular through aerobic capacity.
//
// Power is estimated per segment with Minetti's cost of running (no power meter
// needed): P = weightKg * Cr(grade) * speed, where
//   Cr(i) = 155.4 i^5 − 30.4 i^4 − 43.3 i^3 + 46.3 i^2 + 19.5 i + 3.6  (J/kg/m).

function cr(grade: number): number {
  const i = Math.max(-0.45, Math.min(0.45, grade));
  return 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6;
}

// Cumulative time[] and energy[] (joules/kg-equivalent × weight) for one stream.
// energy[i] is total work done up to sample i. null if unusable.
function cumulativeEnergy(s: StreamSet, weightKg: number): { time: number[]; energy: number[] } | null {
  const time = s.time;
  const dist = s.distance;
  const alt = s.altitude;
  if (!time || !dist || time.length < 2) return null;
  const t: number[] = [time[0]];
  const e: number[] = [0];
  let acc = 0;
  for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1];
    const dd = dist[i] - dist[i - 1];
    if (dt <= 0 || dd < 0) continue;
    const grade = alt && dd > 0 ? (alt[i] - alt[i - 1]) / dd : 0;
    const v = dd / dt;
    const power = weightKg * cr(grade) * v; // watts
    acc += power * dt; // joules
    t.push(time[i]);
    e.push(acc);
  }
  return t.length >= 2 ? { time: t, energy: e } : null;
}

// Best average power (watts) sustained for exactly `durationSec` within one stream.
function bestPowerForDuration(cum: { time: number[]; energy: number[] }, durationSec: number): number | null {
  const { time, energy } = cum;
  if (time[time.length - 1] - time[0] < durationSec) return null;
  let best: number | null = null;
  let lo = 0;
  for (let hi = 1; hi < time.length; hi++) {
    while (time[hi] - time[lo] > durationSec) lo++;
    // Window [lo, hi] is <= duration; extend the exact-duration window backward
    // from hi by interpolating energy at (time[hi] - durationSec).
    const startT = time[hi] - durationSec;
    if (startT < time[0]) continue;
    // Find segment containing startT.
    let j = lo;
    while (j < hi && time[j + 1] < startT) j++;
    const span = time[j + 1] - time[j];
    const frac = span > 0 ? (startT - time[j]) / span : 0;
    const startE = energy[j] + (energy[j + 1] - energy[j]) * frac;
    const avg = (energy[hi] - startE) / durationSec;
    if (best === null || avg > best) best = avg;
  }
  return best;
}

export type PowerPoint = { sec: number; watts: number };

const POWER_DURATIONS = [5, 30, 60, 300, 600, 1200];

// Mean-max power curve across all streams for the default duration set.
export function powerCurve(
  streams: StreamSet[],
  weightKg: number,
  durationsSec: number[] = POWER_DURATIONS,
): PowerPoint[] {
  const cums = streams
    .map((s) => cumulativeEnergy(s, weightKg))
    .filter((c): c is { time: number[]; energy: number[] } => c !== null);
  const out: PowerPoint[] = [];
  for (const sec of durationsSec) {
    let best: number | null = null;
    for (const c of cums) {
      const p = bestPowerForDuration(c, sec);
      if (p != null && (best === null || p > best)) best = p;
    }
    if (best != null) out.push({ sec, watts: Math.round(best) });
  }
  return out;
}
