import type { StreamSet } from "@/lib/db";

// Running-form metrics: stride mechanics, pacing balance, training-intensity
// distribution, and a simple injury-risk heuristic. All pure functions —
// no I/O, no framework code.

// ---- small local helpers ----

function isFiniteNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// Instantaneous speed (m/s) per sample from cumulative distance + time, used
// only when a stream has no velocity_smooth of its own. Central difference in
// the interior, forward/backward difference at the ends.
function deriveSpeed(time?: number[], distance?: number[]): number[] | undefined {
  if (!time || !distance || time.length < 2 || time.length !== distance.length) return undefined;
  const n = time.length;
  const speed = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const lo = i === 0 ? 0 : i - 1;
    const hi = i === n - 1 ? n - 1 : i + 1;
    const dt = time[hi] - time[lo];
    speed[i] = dt > 0 ? (distance[hi] - distance[lo]) / dt : 0;
  }
  return speed;
}

// Index in `time` where the second (by-elapsed-time) half begins. Falls back
// to the array midpoint when there are fewer than 2 points to split on.
function timeSplitIndex(time: number[]): number {
  const n = time.length;
  if (n < 2) return Math.floor(n / 2);
  const mid = time[0] + (time[n - 1] - time[0]) / 2;
  const idx = time.findIndex((t) => t > mid);
  return idx === -1 ? n : idx;
}

// ---- Stride metrics ----

export type StrideMetrics = {
  avgCadenceSpm: number; // mean total (both-leg) steps/min
  avgStrideM: number; // mean metres covered per step
  cadenceDriftPct: number; // (2nd-half avg cadence - 1st-half) / 1st-half * 100
};

// Cadence + stride length from a run's streams.
//
// IMPORTANT: Strava's `cadence` stream is SINGLE-LEG steps/min for runs (it's
// a full revolution count for rides, which is why Strava doesn't double it).
// Every raw sample is multiplied by 2 below to get total (both-leg) steps/min
// before any averaging or drift calculation happens.
//
// Speed comes from `velocity_smooth` when present; otherwise it's derived
// from `distance`/`time` (see `deriveSpeed`). If neither cadence nor a usable
// speed source line up, avgStrideM falls back to 0 rather than throwing.
//
// Returns null only when there is no cadence stream at all.
export function strideMetrics(s: StreamSet): StrideMetrics | null {
  const cadence = s.cadence;
  if (!cadence || cadence.length === 0) return null;

  const time = s.time;
  const speed = s.velocity_smooth ?? deriveSpeed(s.time, s.distance);

  const totalSpm = cadence.filter(isFiniteNum).map((c) => c * 2);
  const avgCadenceSpm = mean(totalSpm);

  const strides: number[] = [];
  for (let i = 0; i < cadence.length; i++) {
    const c = cadence[i];
    const v = speed?.[i];
    if (!isFiniteNum(c) || !isFiniteNum(v)) continue;
    const stepsPerSec = (c * 2) / 60;
    if (stepsPerSec > 0) strides.push((v as number) / stepsPerSec);
  }
  const avgStrideM = strides.length > 0 ? mean(strides) : 0;

  // Split by elapsed time when we have a time stream long enough to cover the
  // cadence samples; otherwise split the cadence array itself in half.
  const splitAt =
    time && time.length >= cadence.length
      ? timeSplitIndex(time.slice(0, cadence.length))
      : Math.floor(cadence.length / 2);

  const firstAvg = mean(cadence.slice(0, splitAt).filter(isFiniteNum).map((c) => c * 2));
  const secondAvg = mean(cadence.slice(splitAt).filter(isFiniteNum).map((c) => c * 2));
  const cadenceDriftPct = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;

  return { avgCadenceSpm, avgStrideM, cadenceDriftPct };
}

// ---- Split balance (even vs. negative/positive pacing) ----

export type SplitBalance = {
  firstHalfSpeed: number; // m/s over the first half of the run's distance
  secondHalfSpeed: number; // m/s over the second half
  negativeSplit: boolean; // true when the second half was faster
  driftPct: number; // (first - second) / first * 100; positive = slowed down
};

// Compares pace over the first vs. second half of a run's total distance
// (not elapsed time). Returns null when the streams can't support a clean
// two-sided split (missing/mismatched arrays, no real distance covered, or
// either half has zero elapsed time).
export function splitBalance(s: StreamSet): SplitBalance | null {
  const distance = s.distance;
  const time = s.time;
  if (!distance || !time || distance.length < 2 || time.length !== distance.length) return null;

  const n = distance.length;
  const totalDist = distance[n - 1] - distance[0];
  if (totalDist <= 0) return null;

  const halfDist = distance[0] + totalDist / 2;
  const splitIdx = distance.findIndex((d) => d >= halfDist);
  if (splitIdx <= 0 || splitIdx >= n - 1) return null; // need real samples on both sides

  const firstDt = time[splitIdx] - time[0];
  const secondDt = time[n - 1] - time[splitIdx];
  if (firstDt <= 0 || secondDt <= 0) return null;

  const firstHalfSpeed = (distance[splitIdx] - distance[0]) / firstDt;
  const secondHalfSpeed = (distance[n - 1] - distance[splitIdx]) / secondDt;
  if (firstHalfSpeed <= 0) return null;

  return {
    firstHalfSpeed,
    secondHalfSpeed,
    negativeSplit: secondHalfSpeed > firstHalfSpeed,
    driftPct: ((firstHalfSpeed - secondHalfSpeed) / firstHalfSpeed) * 100,
  };
}

// ---- Training intensity distribution model ----

export type IntensityModel = {
  model: "polarized" | "pyramidal" | "threshold" | "mixed";
  easyPct: number;
  hardPct: number;
  midPct: number;
};

// Classifies a training block's HR-zone time distribution.
// `zoneSeconds` is [z1, z2, z3, z4, z5] seconds; easy = z1+z2, mid = z3,
// hard = z4+z5, all expressed as a percentage of total logged time.
//
// - "polarized": easy >= 75%, hard >= 10%, mid <= 10%
// - "threshold": mid is the single largest of the three shares
// - "pyramidal": easy > mid > hard (and not polarized)
// - "mixed": anything else, including an all-zero input
export function intensityModel(zoneSeconds: number[]): IntensityModel {
  const [z1, z2, z3, z4, z5] = [0, 1, 2, 3, 4].map((i) => zoneSeconds[i] ?? 0);
  const easy = z1 + z2;
  const mid = z3;
  const hard = z4 + z5;
  const total = easy + mid + hard;

  if (total <= 0) {
    return { model: "mixed", easyPct: 0, hardPct: 0, midPct: 0 };
  }

  const easyPct = (easy / total) * 100;
  const midPct = (mid / total) * 100;
  const hardPct = (hard / total) * 100;

  let model: IntensityModel["model"];
  if (easyPct >= 75 && hardPct >= 10 && midPct <= 10) {
    model = "polarized";
  } else if (midPct > easyPct && midPct > hardPct) {
    model = "threshold";
  } else if (easyPct > midPct && midPct > hardPct) {
    model = "pyramidal";
  } else {
    model = "mixed";
  }

  return { model, easyPct, hardPct, midPct };
}

// ---- Injury risk heuristic ----

export type InjuryRiskInput = {
  acwr: number | null;
  monotony: number | null;
  strain: number | null;
  rampPct: number | null;
};

export type InjuryRisk = {
  level: "low" | "moderate" | "high";
  score: number;
  reasons: string[];
};

// Simple additive risk score from independently-computed load metrics.
// Each threshold below is its own rule (not mutually exclusive with its
// neighbor), so e.g. an ACWR of 1.6 triggers both the >1.5 and >1.3 rules.
// Any input may be null (not enough history yet); null metrics simply don't
// contribute to the score.
export function injuryRisk(input: InjuryRiskInput): InjuryRisk {
  const { acwr, monotony, strain, rampPct } = input;
  let score = 0;
  const reasons: string[] = [];

  if (acwr != null) {
    if (acwr > 1.5) {
      score += 2;
      reasons.push(`Acute:chronic workload ratio ${acwr.toFixed(2)} is above 1.5 (sharp spike).`);
    }
    if (acwr > 1.3 || acwr < 0.8) {
      score += 1;
      reasons.push(
        acwr > 1.3
          ? `ACWR ${acwr.toFixed(2)} is above the 1.3 caution line.`
          : `ACWR ${acwr.toFixed(2)} is below 0.8 (detraining / low resilience).`,
      );
    }
  }

  if (monotony != null) {
    if (monotony > 2) {
      score += 2;
      reasons.push(`Monotony ${monotony.toFixed(2)} is above 2 (very repetitive daily load).`);
    }
    if (monotony > 1.5) {
      score += 1;
      reasons.push(`Monotony ${monotony.toFixed(2)} is above 1.5.`);
    }
  }

  if (rampPct != null) {
    if (rampPct > 10) {
      score += 1;
      reasons.push(`Weekly ramp rate ${rampPct.toFixed(1)}% is above 10%.`);
    }
    if (rampPct > 25) {
      score += 2;
      reasons.push(`Weekly ramp rate ${rampPct.toFixed(1)}% is above 25% (aggressive build).`);
    }
  }

  if (strain != null && strain > 1500) {
    score += 1;
    reasons.push(`Strain ${strain.toFixed(0)} is above 1500.`);
  }

  const level: InjuryRisk["level"] = score >= 4 ? "high" : score >= 2 ? "moderate" : "low";
  return { level, score, reasons };
}
