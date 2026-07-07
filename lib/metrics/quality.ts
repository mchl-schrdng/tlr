import type { ActivityRow, StreamSet } from "@/lib/db";

export type Surface = "indoor" | "outdoor" | "unknown";

export type RunQuality = {
  id: number;
  score: number;
  validPerformance: boolean;
  pausePct: number | null;
  streamDistanceGapPct: number | null;
  reasons: string[];
  flags: {
    tooShort: boolean;
    tooPaused: boolean;
    impossiblePace: boolean;
    missingDistanceStream: boolean;
    distanceMismatch: boolean;
    missingHr: boolean;
    missingCadence: boolean;
  };
};

export type QualitySummary = {
  total: number;
  performanceEligible: number;
  excluded: number;
  averageScore: number;
  pauseOutliers: number;
  missingDistanceStream: number;
  distanceMismatch: number;
  missingHr: number;
  missingCadence: number;
  impossiblePace: number;
};

export type SurfaceSummary = {
  surface: Surface;
  runs: number;
  km: number;
  seconds: number;
  avgPaceSecPerKm: number | null;
  avgHr: number | null;
  elevationM: number;
  sharePct: number;
};

export function pauseRatio(activity: ActivityRow): number | null {
  if (!Number.isFinite(activity.elapsed_time) || activity.elapsed_time <= 0) return null;
  const stopped = Math.max(0, activity.elapsed_time - Math.max(0, activity.moving_time));
  return stopped / activity.elapsed_time;
}

function streamDistance(stream: StreamSet | null): number | null {
  const dist = stream?.distance;
  if (!dist || dist.length < 2) return null;
  const total = dist[dist.length - 1] - dist[0];
  return Number.isFinite(total) && total > 0 ? total : null;
}

export function assessRunQuality(activity: ActivityRow, stream: StreamSet | null): RunQuality {
  const reasons: string[] = [];
  const pause = pauseRatio(activity);
  const paceSecPerKm =
    activity.avg_speed && activity.avg_speed > 0 ? 1000 / activity.avg_speed : activity.moving_time / (activity.distance / 1000);
  const distanceFromStream = streamDistance(stream);
  const distanceGapPct =
    distanceFromStream != null && activity.distance > 0
      ? Math.abs(distanceFromStream - activity.distance) / activity.distance
      : null;

  const flags = {
    tooShort: activity.moving_time < 180 || activity.distance < 800,
    tooPaused: pause != null && pause > 0.25,
    impossiblePace: !Number.isFinite(paceSecPerKm) || paceSecPerKm < 150 || paceSecPerKm > 900,
    missingDistanceStream: distanceFromStream == null,
    distanceMismatch: distanceGapPct != null && distanceGapPct > 0.08,
    missingHr: !stream?.heartrate?.length && activity.avg_hr == null,
    missingCadence: !stream?.cadence?.length && activity.avg_cadence == null,
  };

  let score = 100;
  if (flags.tooShort) {
    score -= 45;
    reasons.push("too short for performance trends");
  }
  if (flags.tooPaused) {
    score -= 30;
    reasons.push("high paused-time ratio");
  }
  if (flags.impossiblePace) {
    score -= 45;
    reasons.push("implausible pace");
  }
  if (flags.missingDistanceStream) {
    score -= 20;
    reasons.push("missing distance stream");
  }
  if (flags.distanceMismatch) {
    score -= 35;
    reasons.push("activity and stream distance disagree");
  }
  if (flags.missingHr) {
    score -= 10;
    reasons.push("missing heart-rate signal");
  }
  if (flags.missingCadence) {
    score -= 5;
    reasons.push("missing cadence signal");
  }

  const validPerformance =
    !flags.tooShort &&
    !flags.tooPaused &&
    !flags.impossiblePace &&
    !flags.missingDistanceStream &&
    !flags.distanceMismatch;

  return {
    id: activity.id,
    score: Math.max(0, Math.min(100, Math.round(score))),
    validPerformance,
    pausePct: pause != null ? Math.round(pause * 1000) / 10 : null,
    streamDistanceGapPct: distanceGapPct != null ? Math.round(distanceGapPct * 1000) / 10 : null,
    reasons,
    flags,
  };
}

export function qualitySummary(
  activities: ActivityRow[],
  getStream: (id: number) => StreamSet | null,
): QualitySummary {
  const rows = activities.map((activity) => assessRunQuality(activity, getStream(activity.id)));
  const count = (fn: (q: RunQuality) => boolean) => rows.filter(fn).length;
  return {
    total: rows.length,
    performanceEligible: count((q) => q.validPerformance),
    excluded: count((q) => !q.validPerformance),
    averageScore: rows.length ? Math.round(rows.reduce((sum, q) => sum + q.score, 0) / rows.length) : 0,
    pauseOutliers: count((q) => q.flags.tooPaused),
    missingDistanceStream: count((q) => q.flags.missingDistanceStream),
    distanceMismatch: count((q) => q.flags.distanceMismatch),
    missingHr: count((q) => q.flags.missingHr),
    missingCadence: count((q) => q.flags.missingCadence),
    impossiblePace: count((q) => q.flags.impossiblePace),
  };
}

export function rawSurface(raw: unknown): Surface {
  if (!raw || typeof raw !== "object" || !("trainer" in raw)) return "unknown";
  const trainer = (raw as { trainer?: unknown }).trainer;
  if (trainer === true) return "indoor";
  if (trainer === false) return "outdoor";
  return "unknown";
}

export function surfaceSplitSummary(
  activities: ActivityRow[],
  rawById: Map<number, unknown>,
): SurfaceSummary[] {
  const buckets = new Map<Surface, SurfaceSummary>();
  for (const surface of ["indoor", "outdoor", "unknown"] as Surface[]) {
    buckets.set(surface, {
      surface,
      runs: 0,
      km: 0,
      seconds: 0,
      avgPaceSecPerKm: null,
      avgHr: null,
      elevationM: 0,
      sharePct: 0,
    });
  }

  const hrBuckets = new Map<Surface, { sum: number; count: number }>();
  for (const activity of activities) {
    const surface = rawSurface(rawById.get(activity.id));
    const bucket = buckets.get(surface) as SurfaceSummary;
    bucket.runs += 1;
    bucket.km += activity.distance / 1000;
    bucket.seconds += activity.moving_time;
    bucket.elevationM += activity.elevation_gain ?? 0;
    if (activity.avg_hr != null) {
      const hr = hrBuckets.get(surface) ?? { sum: 0, count: 0 };
      hr.sum += activity.avg_hr;
      hr.count += 1;
      hrBuckets.set(surface, hr);
    }
  }

  const totalKm = activities.reduce((sum, activity) => sum + activity.distance / 1000, 0);
  return [...buckets.values()].map((bucket) => {
    const hr = hrBuckets.get(bucket.surface);
    return {
      ...bucket,
      km: Math.round(bucket.km * 10) / 10,
      seconds: Math.round(bucket.seconds),
      avgPaceSecPerKm: bucket.km > 0 ? Math.round(bucket.seconds / bucket.km) : null,
      avgHr: hr && hr.count > 0 ? Math.round(hr.sum / hr.count) : null,
      elevationM: Math.round(bucket.elevationM),
      sharePct: totalKm > 0 ? Math.round((bucket.km / totalKm) * 1000) / 10 : 0,
    };
  });
}
