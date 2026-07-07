import type { StreamSet } from "@/lib/db";

// Critical Speed model: the 2-parameter hyperbolic speed/duration relationship
// (the running analogue of critical power in cycling). Pure functions over
// Strava-style time/distance streams. No I/O.

// ---- Mean-maximal speed (best average speed sustained for an exact duration) ----

// Max distance covered by any exact-`duration`-second window within one
// stream's time/distance series. Forward-only two-pointer sweep: for every
// sample used as the window's END, the window's START time is interpolated
// linearly between the two bracketing samples so the result isn't quantized
// to the stream's sampling rate. Returns null if the stream doesn't span at
// least `duration` seconds.
function maxDistanceInWindow(time: number[], dist: number[], duration: number): number | null {
  const n = time.length;
  if (n < 2 || duration <= 0) return null;
  if (time[n - 1] - time[0] < duration) return null;

  let lo = 0;
  let best = -Infinity;
  for (let hi = 0; hi < n; hi++) {
    const tStart = time[hi] - duration;
    if (tStart < time[0]) continue; // window would start before the recording began

    // Advance the left pointer so time[lo] <= tStart <= time[lo + 1].
    while (lo + 1 < n && time[lo + 1] <= tStart) lo++;
    if (time[lo] > tStart) continue; // guarded above, but stay safe

    let dStart: number;
    if (lo + 1 < n && time[lo + 1] > time[lo]) {
      const frac = (tStart - time[lo]) / (time[lo + 1] - time[lo]);
      dStart = dist[lo] + frac * (dist[lo + 1] - dist[lo]);
    } else {
      dStart = dist[lo];
    }

    const covered = dist[hi] - dStart;
    if (covered > best) best = covered;
  }
  return best > -Infinity ? best : null;
}

export type MeanMax = { sec: number; speed: number };

// For each target duration, the best (highest) average speed (m/s) sustained
// for exactly that duration, across ALL supplied streams. A duration is
// omitted from the result if no stream is long enough to contain a window of
// that length.
export function meanMaxSpeed(streams: StreamSet[], durationsSec: number[]): MeanMax[] {
  const results: MeanMax[] = [];
  for (const sec of durationsSec) {
    let bestSpeed = -Infinity;
    for (const s of streams) {
      const time = s.time;
      const dist = s.distance;
      if (!time || !dist || time.length < 2 || dist.length !== time.length) continue;
      const covered = maxDistanceInWindow(time, dist, sec);
      if (covered == null) continue;
      const speed = covered / sec;
      if (speed > bestSpeed) bestSpeed = speed;
    }
    if (isFinite(bestSpeed)) results.push({ sec, speed: bestSpeed });
  }
  return results;
}

// ---- Critical speed (2-parameter CS/D' model) ----

// Duration set the model is fit over: 2, 5, 10 and 20 minutes. This spans the
// range where the hyperbolic speed/duration relationship holds reasonably
// well (much shorter efforts are dominated by anaerobic capacity alone, much
// longer ones by fatigue/fueling effects the model doesn't capture).
const CS_DURATIONS_SEC = [120, 300, 600, 1200];

// Fit the 2-parameter critical-speed model distance = cs * time + dPrime via
// ordinary least squares over the best distance covered for each duration in
// CS_DURATIONS_SEC. `cs` (the regression slope) is the critical speed in
// m/s — the asymptotic speed sustainable indefinitely; `dPrime` (the
// intercept) is the finite anaerobic distance capacity in metres. Returns
// null when fewer than 2 durations have usable data (a line needs 2 points).
export function criticalSpeed(streams: StreamSet[]): { cs: number; dPrime: number } | null {
  const mm = meanMaxSpeed(streams, CS_DURATIONS_SEC);
  if (mm.length < 2) return null;

  const points = mm.map((p) => ({ t: p.sec, d: p.speed * p.sec }));
  const n = points.length;
  const meanT = points.reduce((sum, p) => sum + p.t, 0) / n;
  const meanD = points.reduce((sum, p) => sum + p.d, 0) / n;

  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.t - meanT) * (p.d - meanD);
    den += (p.t - meanT) * (p.t - meanT);
  }
  if (den === 0) return null; // all usable durations identical; can't fit a line

  const cs = num / den;
  const dPrime = meanD - cs * meanT;
  return { cs, dPrime };
}

// ---- Pace zones derived from critical speed ----

export type PaceZone = { label: string; minSpeed: number; maxSpeed: number };

// Five training-speed zones (m/s) as fractions of critical speed. Threshold
// straddles CS itself; Rep is open-ended above 1.12x CS.
export function paceZonesFromCS(cs: number): PaceZone[] {
  return [
    { label: "Easy", minSpeed: 0, maxSpeed: 0.8 * cs },
    { label: "Moderate", minSpeed: 0.8 * cs, maxSpeed: 0.9 * cs },
    { label: "Threshold", minSpeed: 0.9 * cs, maxSpeed: 1.0 * cs },
    { label: "Interval", minSpeed: 1.0 * cs, maxSpeed: 1.12 * cs },
    { label: "Rep", minSpeed: 1.12 * cs, maxSpeed: Infinity },
  ];
}
