import { HR_MAX, ZONE_LABELS } from "@/lib/config";
import type { ActivityRow, StreamSet } from "@/lib/db";
import { sessionLoad } from "@/lib/metrics/aggregate";
import { computeDecoupling, computeHrZones } from "@/lib/metrics/perRun";

const DAY = 86400_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mondayOf(d: Date): Date {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

export type DailyLoad = {
  date: string;
  km: number;
  load: number;
  count: number;
};

export function dailyLoadMatrix(
  activities: ActivityRow[],
  days = 84,
  now = new Date(),
  getStream?: (id: number) => StreamSet | null,
): DailyLoad[] {
  const today = startOfDay(now);
  const buckets = new Map<string, DailyLoad>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.set(isoDate(d), { date: isoDate(d), km: 0, load: 0, count: 0 });
  }
  for (const a of activities) {
    const key = isoDate(startOfDay(new Date(a.start_date)));
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.km += a.distance / 1000;
    bucket.load += sessionLoad(a, getStream ? getStream(a.id) : null);
    bucket.count += 1;
  }
  return [...buckets.values()];
}

export type WeeklyLoad = {
  weekStart: string;
  km: number;
  load: number;
  seconds: number;
  count: number;
};

export function weeklyLoadTrend(
  activities: ActivityRow[],
  weeks = 12,
  now = new Date(),
  getStream?: (id: number) => StreamSet | null,
): WeeklyLoad[] {
  const thisMonday = mondayOf(now);
  const buckets = new Map<string, WeeklyLoad>();
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = new Date(thisMonday);
    ws.setDate(ws.getDate() - i * 7);
    buckets.set(isoDate(ws), { weekStart: isoDate(ws), km: 0, load: 0, seconds: 0, count: 0 });
  }
  for (const a of activities) {
    const key = isoDate(mondayOf(new Date(a.start_date)));
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.km += a.distance / 1000;
    bucket.load += sessionLoad(a, getStream ? getStream(a.id) : null);
    bucket.seconds += a.moving_time;
    bucket.count += 1;
  }
  return [...buckets.values()];
}

export type WeeklyLongRun = {
  weekStart: string;
  km: number;
  longKm: number;
  longSharePct: number | null;
  count: number;
};

export function weeklyLongRunTrend(
  activities: ActivityRow[],
  weeks = 12,
  now = new Date(),
): WeeklyLongRun[] {
  const thisMonday = mondayOf(now);
  const buckets = new Map<string, WeeklyLongRun>();
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = new Date(thisMonday);
    ws.setDate(ws.getDate() - i * 7);
    buckets.set(isoDate(ws), { weekStart: isoDate(ws), km: 0, longKm: 0, longSharePct: null, count: 0 });
  }
  for (const activity of activities) {
    const key = isoDate(mondayOf(new Date(activity.start_date)));
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const km = activity.distance / 1000;
    bucket.km += km;
    bucket.longKm = Math.max(bucket.longKm, km);
    bucket.count += 1;
  }
  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    km: Math.round(bucket.km * 10) / 10,
    longKm: Math.round(bucket.longKm * 10) / 10,
    longSharePct: bucket.km > 0 ? Math.round((bucket.longKm / bucket.km) * 100) : null,
  }));
}

export type LoadShape = {
  load7: number;
  monotony: number | null;
  strain: number | null;
  rampPct: number | null;
  current7Km: number;
  baseline7Km: number | null;
};

// Foster-style training monotony: daily-load mean / standard deviation over 7 days.
// Strain is weekly load multiplied by monotony. Load is TRIMP from HR streams
// when available, otherwise Strava Relative Effort or moving minutes.
export function loadShape(
  activities: ActivityRow[],
  now = new Date(),
  getStream?: (id: number) => StreamSet | null,
): LoadShape {
  const last7 = dailyLoadMatrix(activities, 7, now, getStream);
  const load7 = last7.reduce((sum, d) => sum + d.load, 0);
  const avg = load7 / 7;
  const variance = last7.reduce((sum, d) => sum + (d.load - avg) ** 2, 0) / 7;
  const stdev = Math.sqrt(variance);
  const monotony = stdev > 0 ? avg / stdev : load7 > 0 ? null : 0;
  const strain = monotony != null ? load7 * monotony : null;

  const last28 = dailyLoadMatrix(activities, 28, now, getStream);
  const current7Km = last28.slice(-7).reduce((sum, d) => sum + d.km, 0);
  const baseline7Km = last28.slice(0, 21).reduce((sum, d) => sum + d.km, 0) / 3;
  const rampPct = baseline7Km > 0 ? ((current7Km - baseline7Km) / baseline7Km) * 100 : null;
  return { load7, monotony, strain, rampPct, current7Km, baseline7Km: baseline7Km || null };
}

export type FitnessPoint = {
  date: string;
  load: number;
  fitness: number;
  fatigue: number;
  form: number;
};

// Classic endurance dashboard model: CTL-like fitness (42d EWMA),
// ATL-like fatigue (7d EWMA), and form = fitness - fatigue.
export function fitnessFatigueTrend(
  activities: ActivityRow[],
  days = 84,
  now = new Date(),
  getStream?: (id: number) => StreamSet | null,
): FitnessPoint[] {
  const history = dailyLoadMatrix(activities, days + 42, now, getStream);
  const fitnessAlpha = 1 - Math.exp(-1 / 42);
  const fatigueAlpha = 1 - Math.exp(-1 / 7);
  let fitness = 0;
  let fatigue = 0;
  const points = history.map((d) => {
    fitness += (d.load - fitness) * fitnessAlpha;
    fatigue += (d.load - fatigue) * fatigueAlpha;
    return {
      date: d.date,
      load: Math.round(d.load),
      fitness: Math.round(fitness * 10) / 10,
      fatigue: Math.round(fatigue * 10) / 10,
      form: Math.round((fitness - fatigue) * 10) / 10,
    };
  });
  return points.slice(-days);
}

export type WeeklyZoneDistribution = {
  weekStart: string;
  z1: number;
  z2: number;
  z3: number;
  z4: number;
  z5: number;
  totalSeconds: number;
  easyPct: number;
  hardPct: number;
};

export function weeklyZoneDistribution(
  activities: ActivityRow[],
  getStream: (id: number) => StreamSet | null,
  weeks = 8,
  now = new Date(),
  hrMax = HR_MAX,
): WeeklyZoneDistribution[] {
  const thisMonday = mondayOf(now);
  const buckets = new Map<string, number[]>();
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = new Date(thisMonday);
    ws.setDate(ws.getDate() - i * 7);
    buckets.set(isoDate(ws), ZONE_LABELS.map(() => 0));
  }
  for (const activity of activities) {
    const key = isoDate(mondayOf(new Date(activity.start_date)));
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const stream = getStream(activity.id);
    if (!stream) continue;
    const zones = computeHrZones(stream, hrMax);
    if (!zones) continue;
    for (const z of zones) bucket[z.zone - 1] += z.seconds;
  }
  return [...buckets.entries()].map(([weekStart, seconds]) => {
    const total = seconds.reduce((sum, s) => sum + s, 0);
    const pct = (i: number) => (total > 0 ? Math.round((seconds[i] / total) * 1000) / 10 : 0);
    const easyPct = pct(0) + pct(1);
    const hardPct = pct(3) + pct(4);
    return {
      weekStart,
      z1: pct(0),
      z2: pct(1),
      z3: pct(2),
      z4: pct(3),
      z5: pct(4),
      totalSeconds: total,
      easyPct: Math.round(easyPct * 10) / 10,
      hardPct: Math.round(hardPct * 10) / 10,
    };
  });
}

export type ConsistencySummary = {
  runDays28: number;
  activePct28: number;
  longestStreak28: number;
  currentStreak: number;
  daysSinceLast: number | null;
  longRunKm28: number;
  longRunSharePct28: number | null;
};

export function consistencySummary(activities: ActivityRow[], now = new Date()): ConsistencySummary {
  const days = dailyLoadMatrix(activities, 28, now);
  const runDays28 = days.filter((d) => d.count > 0).length;
  let longestStreak28 = 0;
  let streak = 0;
  for (const day of days) {
    if (day.count > 0) {
      streak += 1;
      longestStreak28 = Math.max(longestStreak28, streak);
    } else {
      streak = 0;
    }
  }
  let currentStreak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count === 0) break;
    currentStreak += 1;
  }
  const today = startOfDay(now).getTime();
  const latest = activities[0] ? startOfDay(new Date(activities[0].start_date)).getTime() : null;
  const last28Runs = activities.filter((a) => today - startOfDay(new Date(a.start_date)).getTime() < 28 * DAY);
  const totalKm28 = last28Runs.reduce((sum, a) => sum + a.distance / 1000, 0);
  const longRunKm28 = Math.max(0, ...last28Runs.map((a) => a.distance / 1000));
  return {
    runDays28,
    activePct28: Math.round((runDays28 / 28) * 100),
    longestStreak28,
    currentStreak,
    daysSinceLast: latest != null ? Math.max(0, Math.round((today - latest) / DAY)) : null,
    longRunKm28: Math.round(longRunKm28 * 10) / 10,
    longRunSharePct28: totalKm28 > 0 ? Math.round((longRunKm28 / totalKm28) * 100) : null,
  };
}

export type PaceHrPoint = {
  id: number;
  date: string;
  paceSecPerKm: number;
  hr: number;
  km: number;
  load: number;
};

type HardDay = {
  date: string;
  count: number;
  hardCount: number;
  km: number;
  load: number;
};

export type HardDayPattern = {
  windowDays: number;
  hardRuns: number;
  hardDays: number;
  backToBackHardDays: number;
  daysSinceHard: number | null;
  days: HardDay[];
  hrSamples: number;
  totalRuns: number;
};

function hardSessionReason(
  activity: ActivityRow,
  stream: StreamSet | null,
  hrMax = HR_MAX,
): { hard: boolean; hasHr: boolean } {
  const hardByRelativeEffort = activity.suffer_score != null && activity.suffer_score >= 70;
  const zones = stream ? computeHrZones(stream, hrMax) : null;
  if (zones) {
    const total = zones.reduce((sum, z) => sum + z.seconds, 0);
    const hardSeconds = zones
      .filter((z) => z.zone >= 4)
      .reduce((sum, z) => sum + z.seconds, 0);
    const hardPct = total > 0 ? (hardSeconds / total) * 100 : 0;
    return {
      hard: hardByRelativeEffort || (hardSeconds >= 600 && hardPct >= 12) || hardPct >= 25,
      hasHr: true,
    };
  }
  if (hardByRelativeEffort) return { hard: true, hasHr: false };
  if (activity.avg_hr != null && activity.moving_time >= 1200) {
    return { hard: activity.avg_hr >= hrMax * 0.82, hasHr: true };
  }
  return { hard: false, hasHr: false };
}

export function hardDayPattern(
  activities: ActivityRow[],
  getStream: (id: number) => StreamSet | null,
  days = 14,
  now = new Date(),
  hrMax = HR_MAX,
): HardDayPattern {
  const today = startOfDay(now);
  const buckets = new Map<string, HardDay>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.set(isoDate(d), { date: isoDate(d), count: 0, hardCount: 0, km: 0, load: 0 });
  }

  let hardRuns = 0;
  let totalRuns = 0;
  let hrSamples = 0;
  for (const activity of activities) {
    const key = isoDate(startOfDay(new Date(activity.start_date)));
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const stream = getStream(activity.id);
    const reason = hardSessionReason(activity, stream, hrMax);
    totalRuns += 1;
    if (reason.hasHr) hrSamples += 1;
    if (reason.hard) {
      bucket.hardCount += 1;
      hardRuns += 1;
    }
    bucket.count += 1;
    bucket.km += activity.distance / 1000;
    bucket.load += sessionLoad(activity, stream);
  }

  const series = [...buckets.values()].map((day) => ({
    ...day,
    km: Math.round(day.km * 10) / 10,
    load: Math.round(day.load),
  }));
  let backToBackHardDays = 0;
  for (let i = 1; i < series.length; i++) {
    if (series[i - 1].hardCount > 0 && series[i].hardCount > 0) backToBackHardDays += 1;
  }
  const lastHard = [...series].reverse().find((day) => day.hardCount > 0);
  const daysSinceHard = lastHard
    ? Math.round((today.getTime() - startOfDay(new Date(lastHard.date)).getTime()) / DAY)
    : null;
  return {
    windowDays: days,
    hardRuns,
    hardDays: series.filter((day) => day.hardCount > 0).length,
    backToBackHardDays,
    daysSinceHard,
    days: series,
    hrSamples,
    totalRuns,
  };
}

export type LongTermProgressionPoint = {
  period: string;
  periodStart: string;
  count: number;
  km: number;
  seconds: number;
  paceSecPerKm: number | null;
  avgHr: number | null;
};

export type ProgressionGranularity = "quarter" | "year";

function progressionPeriod(date: Date, granularity: ProgressionGranularity): { label: string; start: string } {
  const year = date.getFullYear();
  if (granularity === "year") return { label: String(year), start: `${year}-01-01` };
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  const month = (quarter - 1) * 3 + 1;
  return {
    label: `${year} Q${quarter}`,
    start: `${year}-${String(month).padStart(2, "0")}-01`,
  };
}

export function longTermPaceHrProgression(
  activities: ActivityRow[],
  granularity: ProgressionGranularity,
): LongTermProgressionPoint[] {
  const buckets = new Map<
    string,
    LongTermProgressionPoint & { meters: number; hrWeighted: number; hrSeconds: number }
  >();

  for (const activity of activities) {
    const date = new Date(activity.start_date);
    if (Number.isNaN(date.getTime())) continue;
    const { label, start } = progressionPeriod(date, granularity);
    const bucket =
      buckets.get(start) ??
      {
        period: label,
        periodStart: start,
        count: 0,
        km: 0,
        seconds: 0,
        paceSecPerKm: null,
        avgHr: null,
        meters: 0,
        hrWeighted: 0,
        hrSeconds: 0,
      };

    bucket.count += 1;

    if (activity.distance > 0 && activity.moving_time > 0) {
      bucket.meters += activity.distance;
      bucket.seconds += activity.moving_time;
    }

    if (activity.avg_hr != null && activity.avg_hr > 0 && activity.moving_time > 0) {
      bucket.hrWeighted += activity.avg_hr * activity.moving_time;
      bucket.hrSeconds += activity.moving_time;
    }

    buckets.set(start, bucket);
  }

  return [...buckets.values()]
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .map(({ meters, hrWeighted, hrSeconds, ...bucket }) => ({
      ...bucket,
      km: Math.round((meters / 1000) * 10) / 10,
      paceSecPerKm: meters > 0 ? bucket.seconds / (meters / 1000) : null,
      avgHr: hrSeconds > 0 ? hrWeighted / hrSeconds : null,
    }));
}

export function paceHrPoints(
  activities: ActivityRow[],
  limit = 120,
  getStream?: (id: number) => StreamSet | null,
): PaceHrPoint[] {
  return activities
    .filter((a) => {
      if (!a.avg_speed || a.avg_speed <= 0 || !a.avg_hr || a.avg_hr < 90) return false;
      const paceSecPerKm = 1000 / a.avg_speed;
      return paceSecPerKm >= 150 && paceSecPerKm <= 900;
    })
    .slice(0, limit)
    .reverse()
    .map((a) => ({
      id: a.id,
      date: a.start_date.slice(0, 10),
      paceSecPerKm: 1000 / (a.avg_speed as number),
      hr: a.avg_hr as number,
      km: a.distance / 1000,
      load: sessionLoad(a, getStream ? getStream(a.id) : null),
    }));
}

type DecouplingPoint = {
  id: number;
  date: string;
  percent: number;
};

export type QualifiedDecouplingPoint = DecouplingPoint & {
  km: number;
  seconds: number;
};

export function qualifiedDecouplingTrend(
  activities: ActivityRow[],
  getStream: (id: number) => StreamSet | null,
  limit = 8,
): QualifiedDecouplingPoint[] {
  const points: QualifiedDecouplingPoint[] = [];
  for (const activity of activities) {
    if (activity.distance < 5000 || activity.moving_time < 1800) continue;
    if (activity.elapsed_time > activity.moving_time * 1.15) continue;
    const stream = getStream(activity.id);
    if (!stream) continue;
    const zones = computeHrZones(stream);
    if (zones) {
      const total = zones.reduce((sum, z) => sum + z.seconds, 0);
      const hard = zones.filter((z) => z.zone >= 4).reduce((sum, z) => sum + z.seconds, 0);
      if (total > 0 && hard / total > 0.35) continue;
    }
    const decoupling = computeDecoupling(stream);
    if (!decoupling) continue;
    points.push({
      id: activity.id,
      date: activity.start_date.slice(0, 10),
      percent: decoupling.percent,
      km: Math.round((activity.distance / 1000) * 10) / 10,
      seconds: activity.moving_time,
    });
    if (points.length >= limit) break;
  }
  return points.reverse();
}
