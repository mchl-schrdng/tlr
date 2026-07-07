import type { ActivityRow, StreamSet } from "@/lib/db";

// Derive an athlete's real heart-rate anchors from their own data, instead of the
// generic HR_MAX = 220 - age guess. Two anchors:
//   - observed max HR: the highest max_hr ever recorded.
//   - LTHR (lactate threshold HR): the highest HR sustained for a threshold-length
//     effort. The classic field test reads LTHR off a ~20-30 min hard effort, so
//     the best continuously-sustained ~20 min average HR is a solid proxy.
// From LTHR we build Friel-style 5-zone boundaries — zones anchored to threshold,
// which is what actually drives training adaptation.

// Highest max_hr across activities, or null if none recorded.
export function observedMaxHr(activities: ActivityRow[]): number | null {
  let max: number | null = null;
  for (const a of activities) {
    if (a.max_hr != null && (max === null || a.max_hr > max)) max = a.max_hr;
  }
  return max;
}

// Highest average HR sustained continuously for `windowSec` within one stream.
// Sliding window over the time + heartrate arrays. null if the stream is shorter
// than the window or lacks HR.
export function bestSustainedHr(s: StreamSet, windowSec: number): number | null {
  const time = s.time;
  const hr = s.heartrate;
  if (!time || !hr || time.length < 2) return null;
  const n = Math.min(time.length, hr.length);
  if (time[n - 1] - time[0] < windowSec) return null;

  let best: number | null = null;
  let lo = 0;
  // Running time-weighted HR sum over [lo, hi].
  let sum = 0; // sum of hr[i]*dt for segments inside the window
  let dur = 0;
  for (let hi = 1; hi < n; hi++) {
    const dt = time[hi] - time[hi - 1];
    if (dt <= 0) continue;
    const segHr = (hr[hi] + hr[hi - 1]) / 2;
    sum += segHr * dt;
    dur += dt;
    // Shrink from the left until the window is <= windowSec.
    while (dur > windowSec && lo < hi - 1) {
      const dtLo = time[lo + 1] - time[lo];
      if (dtLo <= 0) { lo++; continue; }
      const segHrLo = (hr[lo + 1] + hr[lo]) / 2;
      sum -= segHrLo * dtLo;
      dur -= dtLo;
      lo++;
    }
    if (dur >= windowSec * 0.95) {
      const avg = sum / dur;
      if (best === null || avg > best) best = avg;
    }
  }
  return best;
}

// Estimate LTHR as the best sustained ~20 min average HR across all streams.
export function estimateLthr(streams: StreamSet[], windowSec = 1200): number | null {
  let best: number | null = null;
  for (const s of streams) {
    const v = bestSustainedHr(s, windowSec);
    if (v != null && (best === null || v > best)) best = v;
  }
  return best;
}

export type HrZone = { label: string; min: number; max: number | null };

// Friel-style 5-zone model as fractions of LTHR (bpm boundaries):
//   Z1 recovery   < 0.85 LTHR
//   Z2 endurance  0.85 - 0.89
//   Z3 tempo      0.90 - 0.94
//   Z4 threshold  0.95 - 0.99
//   Z5 VO2max     >= 1.00 LTHR
export function hrZonesFromLthr(lthr: number): HrZone[] {
  const b = (f: number) => Math.round(lthr * f);
  return [
    { label: "Z1 recovery", min: 0, max: b(0.85) },
    { label: "Z2 endurance", min: b(0.85), max: b(0.9) },
    { label: "Z3 tempo", min: b(0.9), max: b(0.95) },
    { label: "Z4 threshold", min: b(0.95), max: b(1.0) },
    { label: "Z5 VO2max", min: b(1.0), max: null },
  ];
}

export type ThresholdProfile = {
  lthr: number | null;
  maxHr: number | null;
  zones: HrZone[] | null;
  source: "estimated" | "none";
};

// One-call profile combining the anchors and derived zones.
export function thresholdProfile(activities: ActivityRow[], streams: StreamSet[]): ThresholdProfile {
  const lthr = estimateLthr(streams);
  const maxHr = observedMaxHr(activities);
  return {
    lthr,
    maxHr,
    zones: lthr != null ? hrZonesFromLthr(lthr) : null,
    source: lthr != null ? "estimated" : "none",
  };
}
