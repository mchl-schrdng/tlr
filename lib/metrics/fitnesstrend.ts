// VO2max PROGRESSION: a trend over time, not a single value.
//
// Rather than estimating fitness from one race performance, we scan every
// run's stream for the fastest continuous `targetM` effort, convert that
// effort to a VDOT (Daniels-Gilbert VO2max-equivalent), and then plot the
// *trailing max* of those VDOTs over a rolling window. The trailing-max
// keeps the line smooth: it steps up the moment a faster effort appears and
// only decays once that effort ages out of the window - it never drops on
// the same day a new best is set. Pure functions, no I/O.

import type { StreamSet, ActivityRow } from "@/lib/db";
import { estimateVdot } from "@/lib/metrics/vo2max";

// Fastest time (seconds) to cover `targetM` continuous metres anywhere
// within a single stream. Uses a two-pointer sliding window over the
// (monotonic, non-decreasing) distance array: for every sample as a
// candidate window start, advance the trailing pointer to the first sample
// whose cumulative distance reaches `targetM` past the start, then
// interpolate linearly between that sample and the previous one to find the
// exact crossing time (streams rarely land exactly on `targetM`).
//
// Returns null if distance/time streams are missing, too short, or the
// activity covers less than `targetM` in total.
export function bestEffortSeconds(s: StreamSet, targetM: number): number | null {
  const time = s.time;
  const dist = s.distance;
  if (!time || !dist || targetM <= 0) return null;

  const n = Math.min(time.length, dist.length);
  if (n < 2) return null;

  const totalDist = dist[n - 1] - dist[0];
  if (totalDist < targetM) return null;

  let best: number | null = null;
  let j = 0; // trailing pointer: smallest index with dist[j] - dist[i] >= targetM

  for (let i = 0; i < n; i++) {
    if (j < i) j = i;
    while (j < n - 1 && dist[j] - dist[i] < targetM) j++;
    if (dist[j] - dist[i] < targetM) break; // remaining distance only shrinks as i grows

    let endTime: number;
    const overshoot = dist[j] - dist[i] - targetM;
    if (overshoot <= 0 || j === i) {
      // Landed exactly on (or under, at array end) the target - no interpolation needed.
      endTime = time[j];
    } else {
      // Interpolate the exact crossing time within the (j-1, j) segment.
      const segDist = dist[j] - dist[j - 1];
      const neededFromPrev = dist[i] + targetM - dist[j - 1];
      const frac = segDist > 0 ? neededFromPrev / segDist : 0;
      endTime = time[j - 1] + frac * (time[j] - time[j - 1]);
    }

    const duration = endTime - time[i];
    if (duration > 0 && (best === null || duration < best)) best = duration;
  }

  return best;
}

export type VdotPoint = { date: string; vo2max: number };

// VO2max progression: one point per activity (oldest -> newest) that has a
// computable best `targetM` effort. Each point's vo2max is the MAX VDOT
// (estimateVdot on the best `targetM` effort) over all such efforts within
// the trailing `windowDays` window ending on that activity's date
// (inclusive). Activities without a stream, or whose stream doesn't cover
// `targetM`, are skipped entirely (no point emitted, and they don't
// contribute to later windows either).
export function vo2maxTrend(
  activities: ActivityRow[],
  getStream: (id: number) => StreamSet | null,
  targetM = 1000,
  windowDays = 42,
): VdotPoint[] {
  const sorted = [...activities].sort(
    (a, b) => Date.parse(a.start_date) - Date.parse(b.start_date),
  );

  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const efforts: { timestamp: number; vo2max: number }[] = [];
  const points: VdotPoint[] = [];

  for (const activity of sorted) {
    const stream = getStream(activity.id);
    if (!stream) continue;

    const seconds = bestEffortSeconds(stream, targetM);
    if (seconds == null || seconds <= 0) continue;

    const timestamp = Date.parse(activity.start_date);
    const vo2max = estimateVdot(targetM, seconds);
    efforts.push({ timestamp, vo2max });

    const cutoff = timestamp - windowMs;
    let trailingMax = -Infinity;
    for (const e of efforts) {
      if (e.timestamp >= cutoff && e.timestamp <= timestamp && e.vo2max > trailingMax) {
        trailingMax = e.vo2max;
      }
    }

    points.push({ date: activity.start_date.slice(0, 10), vo2max: trailingMax });
  }

  return points;
}
