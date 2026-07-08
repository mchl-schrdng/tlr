import type { ActivityRow, StreamSet } from "@/lib/db";
import { computeAcwr, sessionLoad } from "@/lib/metrics/aggregate";
import { computeDecoupling } from "@/lib/metrics/perRun";
import { estimateVdot, racePredictions } from "@/lib/metrics/vo2max";
import { efficiencyTrajectory } from "@/lib/metrics/efficiencytrend";
import { fmtDuration, fmtPaceFromSecPerKm } from "@/lib/format";
import { ACWR_LOW, ACWR_HIGH, ACWR_DANGER, DECOUPLING_THRESHOLD } from "@/lib/config";
import type { Dictionary } from "@/lib/i18n/dict";
import type { Evidence, Insight } from "./types";

export type InsightContext = {
  t: Dictionary;
  activities: ActivityRow[]; // newest first
  getStream: (id: number) => StreamSet | null;
  now: Date;
  // Best sustained effort used to estimate fitness and predict race times.
  refEffort?: { distanceM: number; seconds: number } | null;
  // Raw Strava JSON per activity id, used to read the treadmill flag.
  rawById?: Map<number, unknown>;
};

const DAY = 86400_000;
const km = (m: number) => `${Math.round(m / 1000)} km`;

// Build the deterministic, proof-backed insight list. Each producer returns null
// when its data is insufficient, so the list never contains empty cards.
export function buildInsights(ctx: InsightContext): Insight[] {
  return [
    efficiencyTrendInsight(ctx),
    fitnessPredictionInsight(ctx),
    trainingLoadInsight(ctx),
    aerobicBaseInsight(ctx),
  ].filter((i): i is Insight => i !== null);
}

// "Are you actually getting fitter?" — the aerobic-efficiency trajectory. Compares
// pace-at-HR (EF) over the recent 6 weeks against the 6 before, on aerobic-band
// runs only, and states the result as a pace change at the athlete's median
// aerobic HR. This is the app's headline longitudinal verdict.
function efficiencyTrendInsight(ctx: InsightContext): Insight | null {
  const traj = efficiencyTrajectory(ctx.activities, { now: ctx.now, rawById: ctx.rawById });
  if (!traj) return null;

  const e = ctx.t.ins.efficiency;
  const hr = String(Math.round(traj.refHr));
  const paceGap = `${Math.round(Math.abs(traj.paceDeltaSecPerKm))} s`;
  const pct = `${traj.deltaPct >= 0 ? "+" : "−"}${Math.abs(traj.deltaPct).toFixed(1)}%`;

  const state =
    traj.direction === "improving"
      ? { copy: e.improving, severity: "good" as const }
      : traj.direction === "declining"
        ? { copy: e.declining, severity: "warn" as const }
        : { copy: e.flat, severity: "info" as const };

  const evidence: Evidence[] = [
    { kind: "metric", label: e.evBaseline(hr), value: fmtPaceFromSecPerKm(traj.baselinePaceSecPerKm) },
    { kind: "metric", label: e.evRecent(hr), value: fmtPaceFromSecPerKm(traj.recentPaceSecPerKm) },
  ];

  return {
    id: "aerobic-efficiency",
    severity: state.severity,
    title: state.copy.title,
    message: state.copy.message(hr, paceGap, pct),
    metric: { label: e.metric, value: pct },
    action: state.copy.action,
    evidence,
    formula: e.formula,
  };
}

function fitnessPredictionInsight(ctx: InsightContext): Insight | null {
  const ref = ctx.refEffort;
  if (!ref || ref.distanceM <= 0 || ref.seconds <= 0) return null;
  const vdot = estimateVdot(ref.distanceM, ref.seconds);
  if (vdot <= 0) return null;
  const refKm = ref.distanceM % 1000 === 0
    ? `${ref.distanceM / 1000}`
    : (ref.distanceM / 1000).toFixed(1);

  const f = ctx.t.ins.fitness;
  const evidence: Evidence[] = [
    { kind: "metric", label: f.effort(refKm), value: fmtDuration(Math.round(ref.seconds)) },
    ...racePredictions(ref.distanceM, ref.seconds).map((p) => ({
      kind: "metric" as const,
      label: p.label,
      value: fmtDuration(Math.round(p.seconds)),
    })),
  ];

  return {
    id: "fitness-prediction",
    severity: "info",
    title: f.title,
    message: f.message(refKm, vdot.toFixed(1)),
    metric: { label: f.metric, value: vdot.toFixed(1) },
    action: f.action,
    evidence,
    formula: f.formula,
  };
}

function trainingLoadInsight(ctx: InsightContext): Insight | null {
  const acwr = computeAcwr(ctx.activities, ctx.now, ctx.getStream);
  if (acwr.ratio === null) return null;
  const r = acwr.ratio;

  const l = ctx.t.ins.load;
  let severity: Insight["severity"];
  let copy: { title: string; action: string };
  if (r > ACWR_DANGER) {
    severity = "bad";
    copy = l.overload;
  } else if (r > ACWR_HIGH) {
    severity = "warn";
    copy = l.rising;
  } else if (r < ACWR_LOW) {
    severity = "warn";
    copy = l.underloaded;
  } else {
    severity = "good";
    copy = l.balanced;
  }

  const nowMs = ctx.now.getTime();
  const acuteActs = ctx.activities.filter(
    (a) => nowMs - new Date(a.start_date).getTime() < 7 * DAY,
  );
  const evidence: Evidence[] = acuteActs.slice(0, 6).map((a) => ({
    kind: "activity",
    ref: String(a.id),
    label: a.name,
    value: l.evValue(km(a.distance), Math.round(sessionLoad(a, ctx.getStream(a.id)))),
  }));

  return {
    id: "training-load",
    severity,
    title: copy.title,
    message: l.message(r.toFixed(2), String(ACWR_LOW), String(ACWR_HIGH), acuteActs.length),
    metric: { label: l.metric, value: r.toFixed(2) },
    action: copy.action,
    evidence,
    formula: l.formula,
  };
}

function aerobicBaseInsight(ctx: InsightContext): Insight | null {
  const recent = ctx.activities
    .filter((a) => ctx.now.getTime() - new Date(a.start_date).getTime() < 42 * DAY)
    .slice(0, 8);
  const points: { a: ActivityRow; pct: number }[] = [];
  for (const a of recent) {
    const s = ctx.getStream(a.id);
    if (!s) continue;
    const d = computeDecoupling(s);
    if (d) points.push({ a, pct: d.percent });
  }
  if (points.length === 0) return null;

  const sorted = points.map((p) => p.pct).sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const ab = ctx.t.ins.aerobic;
  const evidence: Evidence[] = points.slice(0, 4).map((p) => ({
    kind: "activity",
    ref: String(p.a.id),
    label: p.a.name,
    value: ab.evValue(p.pct.toFixed(1)),
  }));
  const m = median.toFixed(1);

  if (median <= DECOUPLING_THRESHOLD) {
    return {
      id: "aerobic-base",
      severity: "good",
      title: ab.solid.title,
      message: ab.solid.message(m),
      metric: { label: ab.metric, value: `${m}%` },
      action: ab.solid.action,
      evidence,
      formula: ab.formula,
    };
  }
  return {
    id: "aerobic-base",
    severity: "warn",
    title: ab.needsWork.title,
    message: ab.needsWork.message(m),
    metric: { label: ab.metric, value: `${m}%` },
    action: ab.needsWork.action,
    evidence,
    formula: ab.formula,
  };
}
