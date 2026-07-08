// AEROBIC-EFFICIENCY TRAJECTORY: "are you actually getting fitter?"
//
// The single most honest fitness signal a runner can read from their own
// history is pace at a given heart rate over time. Efficiency Factor
// EF = avg_speed ÷ avg_HR — a higher EF means more speed per beat. We compare
// the median EF of the recent window against the window before it.
//
// Comparability is everything here: EF is only meaningful when the runs are
// alike, so we keep only runs that are
//   - aerobic  (avg HR inside the aerobic band — an interval session has a very
//     different EF and would swamp the trend),
//   - outdoor  (treadmill pace is miscalibrated and indoor HR runs hot), and
//   - flat     (climbing slows pace at a given HR regardless of fitness — a trail
//     run must never read as "getting slower").
// Mixing treadmill, flat road and trail runs would make the verdict meaningless.
//
// The delta is then translated back into the language runners think in — pace at
// a reference HR — so the verdict reads "your easy pace at ~140 bpm is ~11 s/km
// faster than 6 weeks ago." Pure functions, no I/O.

import type { ActivityRow } from "@/lib/db";
import { rawSurface } from "@/lib/metrics/quality";
import {
  HR_MAX,
  AEROBIC_HR_MIN_FRAC,
  AEROBIC_HR_MAX_FRAC,
  EFFICIENCY_WINDOW_DAYS,
  EFFICIENCY_MIN_SAMPLES,
  EFFICIENCY_TREND_MIN_PCT,
  EFFICIENCY_FLAT_MAX_GAIN_PER_KM,
} from "@/lib/config";

export type EfficiencyTrajectory = {
  recentEf: number; // median EF (speed/HR ×1000) in the recent window
  baselineEf: number; // median EF in the preceding window
  deltaPct: number; // (recent − baseline) / baseline × 100; + = fitter
  direction: "improving" | "declining" | "flat";
  refHr: number; // median aerobic HR used to translate EF into pace
  recentPaceSecPerKm: number; // implied pace at refHr, recent window
  baselinePaceSecPerKm: number; // implied pace at refHr, baseline window
  paceDeltaSecPerKm: number; // baseline − recent; + = faster now
  recentSamples: number;
  baselineSamples: number;
};

// `rawById` lets us read Strava's `trainer` flag to drop treadmill runs; when it
// is omitted no run is treated as indoor (callers that can, pass it).
type Opts = { now?: Date; rawById?: Map<number, unknown> };

type AerobicRun = { ef: number; hr: number };

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// EF = speed (m/s) / HR (bpm) × 1000, kept only for a comparable run: aerobic HR,
// outdoor (not treadmill), and flat (low climb per km, elevation data present).
function eligibleRun(a: ActivityRow, raw: unknown): AerobicRun | null {
  const hr = a.avg_hr;
  const speed = a.avg_speed;
  if (!hr || hr <= 0 || !speed || speed <= 0) return null;
  if (hr < HR_MAX * AEROBIC_HR_MIN_FRAC || hr > HR_MAX * AEROBIC_HR_MAX_FRAC) return null;
  if (rawSurface(raw) === "indoor") return null;
  // No elevation data means we can't confirm the run was flat — leave it out.
  if (a.elevation_gain == null || a.distance <= 0) return null;
  const gainPerKm = a.elevation_gain / (a.distance / 1000);
  if (gainPerKm > EFFICIENCY_FLAT_MAX_GAIN_PER_KM) return null;
  return { ef: (speed / hr) * 1000, hr };
}

export function efficiencyTrajectory(
  activities: ActivityRow[],
  opts: Opts = {},
): EfficiencyTrajectory | null {
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const DAY = 86400_000;
  const recentCutoff = nowMs - EFFICIENCY_WINDOW_DAYS * DAY;
  const baselineCutoff = nowMs - 2 * EFFICIENCY_WINDOW_DAYS * DAY;

  const recent: AerobicRun[] = [];
  const baseline: AerobicRun[] = [];
  for (const a of activities) {
    const r = eligibleRun(a, opts.rawById?.get(a.id));
    if (!r) continue;
    const ts = new Date(a.start_date).getTime();
    if (ts > nowMs) continue;
    if (ts > recentCutoff) recent.push(r);
    else if (ts > baselineCutoff) baseline.push(r);
  }

  if (recent.length < EFFICIENCY_MIN_SAMPLES || baseline.length < EFFICIENCY_MIN_SAMPLES) {
    return null;
  }

  const recentEf = median(recent.map((r) => r.ef));
  const baselineEf = median(baseline.map((r) => r.ef));
  const deltaPct = ((recentEf - baselineEf) / baselineEf) * 100;

  const refHr = median([...recent, ...baseline].map((r) => r.hr));
  // At a fixed HR, implied speed = EF/1000 × HR, so pace = 1000/speed.
  const impliedPace = (ef: number) => 1_000_000 / (ef * refHr);
  const recentPaceSecPerKm = impliedPace(recentEf);
  const baselinePaceSecPerKm = impliedPace(baselineEf);

  let direction: EfficiencyTrajectory["direction"];
  if (deltaPct >= EFFICIENCY_TREND_MIN_PCT) direction = "improving";
  else if (deltaPct <= -EFFICIENCY_TREND_MIN_PCT) direction = "declining";
  else direction = "flat";

  return {
    recentEf,
    baselineEf,
    deltaPct,
    direction,
    refHr,
    recentPaceSecPerKm,
    baselinePaceSecPerKm,
    paceDeltaSecPerKm: baselinePaceSecPerKm - recentPaceSecPerKm,
    recentSamples: recent.length,
    baselineSamples: baseline.length,
  };
}
