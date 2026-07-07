import type { ActivityRow, StreamSet } from "@/lib/db";
import { trimp } from "@/lib/metrics/load";

// Load proxy per activity: Strava Relative Effort (suffer_score) when available,
// otherwise a duration-based fallback (minutes of moving time).
export function activityLoad(a: ActivityRow): number {
  if (a.suffer_score != null) return a.suffer_score;
  return a.moving_time / 60;
}

// Intensity-aware per-session load: Banister TRIMP from the HR stream when
// available, otherwise the Relative Effort / duration proxy. TRIMP is preferred
// because it separates an easy hour from a hard hour — the physiologically
// correct input for CTL/ATL/TSB, monotony and strain.
export function sessionLoad(a: ActivityRow, stream: StreamSet | null): number {
  if (stream) {
    const t = trimp(stream);
    if (t != null) return t;
  }
  return activityLoad(a);
}

// ---- Weekly volume ----

export type WeekBucket = {
  weekStart: string; // ISO date (Monday) of the week
  km: number;
  seconds: number;
  count: number;
};

// Monday 00:00 (local) of the week containing `d`.
function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - day);
  return x;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Weekly distance/time for the last `weeks` weeks, oldest first, zero-filled.
export function weeklyVolume(activities: ActivityRow[], weeks = 12, now = new Date()): WeekBucket[] {
  const thisMonday = mondayOf(now);
  const buckets = new Map<string, WeekBucket>();
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = new Date(thisMonday);
    ws.setDate(ws.getDate() - i * 7);
    buckets.set(isoDate(ws), { weekStart: isoDate(ws), km: 0, seconds: 0, count: 0 });
  }
  for (const a of activities) {
    const key = isoDate(mondayOf(new Date(a.start_date)));
    const b = buckets.get(key);
    if (b) {
      b.km += a.distance / 1000;
      b.seconds += a.moving_time;
      b.count += 1;
    }
  }
  return [...buckets.values()];
}

// ---- ACWR (acute:chronic workload ratio) ----

export type Acwr = {
  acuteDaily: number; // avg daily load over last 7 days
  chronicDaily: number; // avg daily load over last 28 days
  ratio: number | null; // acute/chronic, null if no chronic load
};

export function computeAcwr(
  activities: ActivityRow[],
  now = new Date(),
  getStream?: (id: number) => StreamSet | null,
): Acwr {
  const nowMs = now.getTime();
  const DAY = 86400_000;
  let acute = 0;
  let chronic = 0;
  for (const a of activities) {
    const ageMs = nowMs - new Date(a.start_date).getTime();
    if (ageMs < 0) continue;
    const load = sessionLoad(a, getStream ? getStream(a.id) : null);
    if (ageMs < 7 * DAY) acute += load;
    if (ageMs < 28 * DAY) chronic += load;
  }
  const acuteDaily = acute / 7;
  const chronicDaily = chronic / 28;
  return {
    acuteDaily,
    chronicDaily,
    ratio: chronicDaily > 0 ? acuteDaily / chronicDaily : null,
  };
}

// ---- Aerobic efficiency trend ----

export type EfficiencyPoint = {
  date: string;
  ef: number; // efficiency factor: speed (m/s) per bpm, scaled x1000
};

// Efficiency factor per run (needs avg speed + avg HR). Higher = fitter.
// Scaled ×1000 for readable numbers; reference HR only documents the intent.
export function efficiencyTrend(activities: ActivityRow[]): EfficiencyPoint[] {
  return activities
    .filter((a) => a.avg_hr && a.avg_hr > 0 && a.avg_speed && a.avg_speed > 0)
    .map((a) => ({
      date: a.start_date.slice(0, 10),
      ef: ((a.avg_speed as number) / (a.avg_hr as number)) * 1000,
    }))
    .sort((x, y) => x.date.localeCompare(y.date));
}

// ---- Personal bests (best rolling effort over a target distance) ----

export type BestEffort = { distanceM: number; seconds: number; paceSecPerKm: number };

// Fastest continuous `targetM` window within one activity's streams.
export function bestEffort(streams: StreamSet, targetM: number): BestEffort | null {
  const time = streams.time;
  const dist = streams.distance;
  if (!time || !dist || dist.length < 2) return null;
  if (dist[dist.length - 1] - dist[0] < targetM) return null;

  let best = Infinity;
  let lo = 0;
  for (let hi = 0; hi < dist.length; hi++) {
    while (dist[hi] - dist[lo] >= targetM) {
      // Interpolate exact time for `targetM` ending at hi, starting just after lo.
      const spanDist = dist[hi] - dist[lo];
      const spanTime = time[hi] - time[lo];
      const t = spanDist > 0 ? spanTime * (targetM / spanDist) : spanTime;
      if (t < best) best = t;
      lo++;
    }
  }
  if (!isFinite(best)) return null;
  return { distanceM: targetM, seconds: best, paceSecPerKm: (best / targetM) * 1000 };
}

const PB_DISTANCES = [1000, 5000, 10000];

// Best effort per PB distance across a set of activities' streams.
export function personalBests(streamsList: StreamSet[]): BestEffort[] {
  return PB_DISTANCES.map((target) => {
    let best: BestEffort | null = null;
    for (const s of streamsList) {
      const e = bestEffort(s, target);
      if (e && (!best || e.seconds < best.seconds)) best = e;
    }
    return best;
  }).filter((x): x is BestEffort => x !== null);
}
