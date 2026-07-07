// Grade-Adjusted Pace (GAP) and running power, based on Minetti's (2002)
// metabolic cost-of-running model. Pure functions, no I/O.
//
// Minetti cost of transport Cr(i) in J/kg/m, where i is grade as a fraction
// (0.1 = 10% incline). Valid over the fitted range i ∈ [-0.45, 0.45];
// grades outside that range are clamped before evaluating the polynomial.
import type { StreamSet } from "@/lib/db";

const MIN_GRADE = -0.45;
const MAX_GRADE = 0.45;
const EPS = 1e-6; // treat |Δdistance| below this as "no movement"

function clampGrade(i: number): number {
  return Math.max(MIN_GRADE, Math.min(MAX_GRADE, i));
}

// Minetti (2002) polynomial fit for energy cost of running on a grade.
// Cr(0) = 3.6 J/kg/m (flat-ground cost of running).
function costOfRunning(i: number): number {
  const g = clampGrade(i);
  return (
    155.4 * g ** 5 -
    30.4 * g ** 4 -
    43.3 * g ** 3 +
    46.3 * g ** 2 +
    19.5 * g +
    3.6
  );
}

// A per-sample segment between two consecutive stream points, used by the
// speed/power estimators below. Segments with a non-positive Δt or a
// negative Δdistance (clock/GPS glitches) are dropped.
type GapSegment = {
  dtSec: number; // duration of the segment (s)
  dDist: number; // distance covered (m), >= 0
  grade: number; // clamped grade fraction over the segment (0 if no altitude data)
};

function toGapSegments(s: StreamSet): GapSegment[] {
  const time = s.time;
  const dist = s.distance;
  if (!time || !dist) return [];
  const alt = s.altitude;
  const n = Math.min(time.length, dist.length, alt ? alt.length : Infinity);
  if (n < 2) return [];
  const segs: GapSegment[] = [];
  for (let i = 1; i < n; i++) {
    const dtSec = time[i] - time[i - 1];
    const dDist = dist[i] - dist[i - 1];
    if (dtSec <= 0 || dDist < 0) continue; // clock/GPS glitch
    let grade = 0;
    if (alt && Math.abs(dDist) >= EPS) {
      grade = clampGrade((alt[i] - alt[i - 1]) / dDist);
    }
    segs.push({ dtSec, dDist, grade });
  }
  return segs;
}

// Per-segment grade fraction from Δaltitude/Δdistance, one entry per pair of
// consecutive stream points (length = points.length - 1). 0 when
// Δdistance ≈ 0 (stopped/GPS jitter); clamped to [-0.45, 0.45] otherwise.
// Unlike toGapSegments (used for the speed/power estimators), this does not
// drop segments with a non-positive Δt or Δdistance — it's a raw per-segment
// series for inspection/plotting.
export function gradeSeries(s: StreamSet): number[] {
  const dist = s.distance;
  const alt = s.altitude;
  if (!dist || !alt) return [];
  const n = Math.min(dist.length, alt.length);
  if (n < 2) return [];
  const grades: number[] = [];
  for (let i = 1; i < n; i++) {
    const dDist = dist[i] - dist[i - 1];
    const dAlt = alt[i] - alt[i - 1];
    grades.push(Math.abs(dDist) < EPS ? 0 : clampGrade(dAlt / dDist));
  }
  return grades;
}

// Grade-adjusted-pace factor: metabolic cost of running at this grade
// relative to flat ground. gapFactor(0) === 1; uphill grades are > 1
// (cost more per metre than flat); downhill grades below Minetti's optimal
// descent (~ -10%) are also > 1, since running downhill too steep is costly.
export function gapFactor(grade: number): number {
  return costOfRunning(grade) / costOfRunning(0);
}

// Flat-equivalent average speed (m/s): each moving segment's distance is
// scaled by its gapFactor before summing, so uphill distance "counts more"
// and downhill "counts less", then divided by total moving time.
// Returns null if there's no usable time+distance data.
export function gradeAdjustedSpeed(s: StreamSet): number | null {
  const segs = toGapSegments(s);
  if (segs.length === 0) return null;
  let flatEquivDist = 0;
  let totalTime = 0;
  for (const seg of segs) {
    flatEquivDist += gapFactor(seg.grade) * seg.dDist;
    totalTime += seg.dtSec;
  }
  return totalTime > 0 ? flatEquivDist / totalTime : null;
}

// Estimated average running power (W): mean over moving segments of
// weightKg * Cr(grade) * v, where v = Δdistance/Δt (m/s).
// Returns null if there's no usable time+distance data.
export function runningPowerAvg(s: StreamSet, weightKg: number): number | null {
  const segs = toGapSegments(s);
  if (segs.length === 0) return null;
  let sum = 0;
  for (const seg of segs) {
    const v = seg.dDist / seg.dtSec;
    sum += weightKg * costOfRunning(seg.grade) * v;
  }
  return sum / segs.length;
}
