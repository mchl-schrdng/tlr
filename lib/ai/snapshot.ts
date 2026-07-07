import { activityRawMap, getAthleteProfile, getStreams, getToken, listActivities } from "@/lib/db";
import { computeAcwr, personalBests, weeklyVolume } from "@/lib/metrics/aggregate";
import { vo2maxTrend } from "@/lib/metrics/fitnesstrend";
import { criticalSpeed, paceZonesFromCS } from "@/lib/metrics/criticalspeed";
import { durabilitySummary } from "@/lib/metrics/durability";
import { intensityModel } from "@/lib/metrics/form";
import { powerCurve } from "@/lib/metrics/powercurve";
import { assessRunQuality, qualitySummary, surfaceSplitSummary } from "@/lib/metrics/quality";
import { computeDecoupling } from "@/lib/metrics/perRun";
import { racePredictions } from "@/lib/metrics/vo2max";
import { thresholdProfile } from "@/lib/metrics/threshold";
import { buildInsights } from "@/lib/insights/engine";
import { coach } from "@/lib/coaching";
import {
  consistencySummary,
  dailyLoadMatrix,
  fitnessFatigueTrend,
  hardDayPattern,
  loadShape,
  longTermPaceHrProgression,
  qualifiedDecouplingTrend,
  weeklyLoadTrend,
  weeklyLongRunTrend,
  weeklyZoneDistribution,
} from "@/lib/metrics/dashboard";
import {
  acwrCopy,
  buildGreenPath,
  currentReadout,
  dashboardClock,
  driftCopy,
  formCopy,
  hardSpacingCopy,
  median,
} from "@/lib/dashboard/status";
import { buildRaceReadiness } from "@/lib/dashboard/readiness";
import { fmtDuration, fmtPaceFromSecPerKm, fmtPaceFromSpeed } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n";
import type { TrainingSnapshot } from "./types";

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function nullableRound(value: number | null | undefined, digits = 1): number | null {
  return value == null || !Number.isFinite(value) ? null : round(value, digits);
}

function km(meters: number): number {
  return round(meters / 1000, 1);
}

function labelForDistance(meters: number): string {
  if (meters === 1000) return "1K";
  if (meters === 5000) return "5K";
  if (meters === 10000) return "10K";
  return `${round(meters / 1000, 1)}K`;
}

function powerDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec % 60 === 0) return `${sec / 60}min`;
  return `${sec}s`;
}

function recentDecouplingMedian(ids: number[]): number | null {
  const vals: number[] = [];
  for (const id of ids.slice(0, 8)) {
    const stream = getStreams(id);
    if (!stream) continue;
    const decoupling = computeDecoupling(stream);
    if (decoupling) vals.push(decoupling.percent);
  }
  return median(vals);
}

export function buildTrainingSnapshot(t: Dictionary, locale: Locale): TrainingSnapshot {
  const connected = !!getToken();
  const runs = connected ? listActivities("Run") : [];
  const now = dashboardClock(runs[0]);
  const generatedAt = new Date().toISOString();
  const totalMeters = runs.reduce((sum, run) => sum + run.distance, 0);
  const rawById = connected ? activityRawMap() : new Map<number, unknown>();
  const signal = runs.length ? qualitySummary(runs, getStreams) : null;
  const performanceRuns = runs.filter((run) => assessRunQuality(run, getStreams(run.id)).validPerformance);
  const performanceStreams = performanceRuns
    .map((run) => getStreams(run.id))
    .filter((stream): stream is NonNullable<typeof stream> => stream !== null);
  const surfaces = runs.length ? surfaceSplitSummary(runs, rawById) : [];
  const acwr = runs.length ? computeAcwr(runs, now, getStreams) : null;
  const weeklyVolumeBuckets = runs.length ? weeklyVolume(runs, 1, now) : [];
  const thisWeekKm = round(weeklyVolumeBuckets[0]?.km ?? 0, 1);
  const last28 = runs.filter((run) => now.getTime() - new Date(run.start_date).getTime() < 28 * 86_400_000);
  const last28Km = round(last28.reduce((sum, run) => sum + run.distance / 1000, 0), 1);
  const last28Seconds = last28.reduce((sum, run) => sum + run.moving_time, 0);
  const weeklyLoad = runs.length ? weeklyLoadTrend(runs, 12, now, getStreams) : [];
  const shape = runs.length ? loadShape(runs, now, getStreams) : null;
  const dailyLoad = runs.length ? dailyLoadMatrix(runs, 84, now, getStreams) : [];
  const qualifiedDrift = qualifiedDecouplingTrend(runs, getStreams, 8);
  const qualifiedDriftMedian = median(qualifiedDrift.map((point) => point.percent));
  const fitness = runs.length ? fitnessFatigueTrend(runs, 84, now, getStreams) : [];
  const latestFitness = fitness.at(-1);
  const form = latestFitness?.form ?? null;
  const weeklyZones = runs.length ? weeklyZoneDistribution(runs, getStreams, 8, now) : [];
  const latestZones = weeklyZones.at(-1);
  const hardPattern = runs.length ? hardDayPattern(runs, getStreams, 14, now) : null;
  const hardStatus = hardSpacingCopy(t, hardPattern);
  const longRunTrend = runs.length ? weeklyLongRunTrend(runs, 12, now) : [];
  const quarterlyProgression = runs.length ? longTermPaceHrProgression(runs, "quarter") : [];
  const yearlyProgression = runs.length ? longTermPaceHrProgression(runs, "year") : [];
  const zoneModel = intensityModel(
    latestZones ? [latestZones.z1, latestZones.z2, latestZones.z3, latestZones.z4, latestZones.z5] : [],
  );
  const consistency = runs.length ? consistencySummary(runs, now) : null;
  const pbs = connected && performanceStreams.length ? personalBests(performanceStreams) : [];
  const best5k = pbs.find((pb) => pb.distanceM === 5000);
  const refPb = best5k ?? pbs.find((pb) => pb.distanceM === 10000) ?? pbs.find((pb) => pb.distanceM === 1000) ?? null;
  const predictions = refPb ? racePredictions(refPb.distanceM, refPb.seconds) : [];
  const vo2Five = performanceRuns.length ? vo2maxTrend(performanceRuns, getStreams, 5000, 56) : [];
  const vo2One = vo2Five.length >= 4 ? vo2Five : performanceRuns.length ? vo2maxTrend(performanceRuns, getStreams, 1000, 42) : [];
  const vo2Target = vo2Five.length >= 4 ? "5K" : "1K";
  const latestVo2 = vo2One.at(-1)?.vo2max ?? null;
  const bestVo2 = vo2One.length ? Math.max(...vo2One.map((point) => point.vo2max)) : null;
  const olderVo2 = vo2One.length > 8 ? vo2One.at(-9)?.vo2max : vo2One.at(0)?.vo2max;
  const cs = performanceStreams.length ? criticalSpeed(performanceStreams) : null;
  const csZones = cs ? paceZonesFromCS(cs.cs) : [];
  const threshold = runs.length ? thresholdProfile(runs, performanceStreams) : null;
  const weightKg = getAthleteProfile()?.weightKg ?? 75;
  const powerPoints = performanceStreams.length ? powerCurve(performanceStreams, weightKg) : [];
  const durability = runs.length ? durabilitySummary(runs, getStreams) : null;
  const thresholdZone = csZones.find((zone) => zone.label === "Threshold");
  const easyZone = csZones.find((zone) => zone.label === "Easy");
  const recentDrift =
    qualifiedDriftMedian ?? (performanceRuns.length ? recentDecouplingMedian(performanceRuns.map((run) => run.id)) : null);
  const recommendations = runs.length ? coach(t, runs, now, recentDrift, getStreams).recommendations : [];
  const insights = runs.length
    ? buildInsights({
        t,
        activities: runs,
        getStream: (id) => getStreams(id),
        now,
        refEffort: refPb ? { distanceM: refPb.distanceM, seconds: refPb.seconds } : null,
      })
    : [];
  const loadStatus = acwrCopy(t, acwr?.ratio ?? null);
  const formStatus = formCopy(t, form);
  const driftStatus = driftCopy(t, recentDrift);
  const readout = currentReadout(t, {
    acwrRatio: acwr?.ratio ?? null,
    form,
    hardPattern,
    drift: recentDrift,
  });
  const greenPath = buildGreenPath(t, {
    dailyLoads: dailyLoad,
    acwrRatio: acwr?.ratio ?? null,
    fitness: latestFitness?.fitness ?? null,
    fatigue: latestFitness?.fatigue ?? null,
    form,
    hardPattern,
    drift: recentDrift,
    easyPace: easyZone ? fmtPaceFromSpeed(easyZone.maxSpeed) : null,
  });
  const raceReadiness = buildRaceReadiness({
    acwrRatio: acwr?.ratio ?? null,
    form,
    drift: recentDrift,
    hardPattern,
    labels: {
      load: t.lbl.load,
      form: t.lbl.form,
      intensity: t.lbl.intensity,
      durability: t.lbl.durability,
      noData: "-",
      limiterNone: t.perf.readiness.limiterNone,
      limiterLoad: t.perf.readiness.limiterLoad,
      limiterForm: t.perf.readiness.limiterForm,
      limiterIntensity: t.perf.readiness.limiterIntensity,
      limiterDurability: t.perf.readiness.limiterDurability,
      ready: t.perf.readiness.ready,
      sharpen: t.perf.readiness.sharpen,
      absorb: t.perf.readiness.absorb,
      blocked: t.perf.readiness.blocked,
    },
  });

  return {
    version: 1,
    locale,
    generatedAt,
    asOf: now.toISOString(),
    connected,
    history: {
      runs: runs.length,
      totalKm: km(totalMeters),
      latestRunDate: runs[0]?.start_date.slice(0, 10) ?? null,
      thisWeekKm,
      last28Km,
      last28Hours: round(last28Seconds / 3600, 1),
    },
    current: {
      readout: {
        cls: readout.cls,
        label: readout.label,
        title: readout.title,
        body: readout.body,
        action: readout.action,
      },
      greenPath: {
        title: greenPath.title,
        action: greenPath.action,
        checkpoint: greenPath.checkpoint,
        loadDays: greenPath.loadDays,
        formDays: greenPath.formDays,
        spacingDays: greenPath.spacingDays,
      },
      load: {
        acwr: nullableRound(acwr?.ratio, 2),
        label: loadStatus.label,
        line: loadStatus.line,
        rampPct: nullableRound(shape?.rampPct, 0),
        monotony: nullableRound(shape?.monotony, 2),
        strain: nullableRound(shape?.strain, 0),
      },
      form: {
        fitness: nullableRound(latestFitness?.fitness, 1),
        fatigue: nullableRound(latestFitness?.fatigue, 1),
        form: nullableRound(form, 1),
        label: formStatus.label,
        line: formStatus.line,
      },
      intensity: {
        hardDays14: hardPattern?.hardDays ?? 0,
        hardRuns14: hardPattern?.hardRuns ?? 0,
        backToBackHardDays: hardPattern?.backToBackHardDays ?? 0,
        easyPct: nullableRound(latestZones ? latestZones.easyPct : null, 1),
        hardPct: nullableRound(latestZones ? latestZones.hardPct : null, 1),
        label: hardStatus.label,
        line: hardStatus.line || zoneModel.model,
      },
      durability: {
        recentDriftPct: nullableRound(recentDrift, 1),
        samples: qualifiedDrift.length,
        label: driftStatus.label,
        line: driftStatus.line,
      },
      readiness: {
        score: raceReadiness.score,
        label: raceReadiness.label,
        line: raceReadiness.line,
        limiter: raceReadiness.limiter,
        factors: raceReadiness.factors.map(
          (factor) => `${factor.label}: ${factor.value}, penalty ${factor.penalty}, score ${factor.score}`,
        ),
      },
      consistency: {
        runDays28: consistency?.runDays28 ?? null,
        activePct28: consistency?.activePct28 ?? null,
        currentStreak: consistency?.currentStreak ?? null,
        longRunKm28: consistency?.longRunKm28 ?? null,
        longRunSharePct28: consistency?.longRunSharePct28 ?? null,
      },
    },
    performance: {
      criticalSpeed: {
        pace: cs ? fmtPaceFromSpeed(cs.cs) : null,
        grade: cs ? `${Math.round(cs.dPrime)} m D'` : null,
        easyCeiling: easyZone ? fmtPaceFromSpeed(easyZone.maxSpeed) : null,
        thresholdBand: thresholdZone
          ? `${fmtPaceFromSpeed(thresholdZone.maxSpeed)}-${fmtPaceFromSpeed(thresholdZone.minSpeed)}`
          : null,
      },
      heartRateZones: {
        source: threshold?.source ?? "none",
        lthrBpm: threshold?.lthr ? Math.round(threshold.lthr) : null,
        zones:
          threshold?.zones?.map((zone) => ({
            label: zone.label,
            from: zone.min,
            to: zone.max,
          })) ?? [],
      },
      vo2: {
        latest: nullableRound(latestVo2, 1),
        best: nullableRound(bestVo2, 1),
        delta: latestVo2 != null && olderVo2 != null ? round(latestVo2 - olderVo2, 1) : null,
        target: vo2Target,
      },
      durability: {
        grade: durability?.rating ?? null,
        scorePct: nullableRound(durability?.medianFadePct, 1),
        longRuns: durability?.runs ?? null,
      },
      powerCurve: powerPoints.map((point) => ({
        duration: powerDuration(point.sec),
        watts: point.watts,
        wattsPerKg: nullableRound(point.watts / weightKg, 1),
      })),
      personalBests: pbs.map((pb) => ({
        distance: labelForDistance(pb.distanceM),
        time: fmtDuration(Math.round(pb.seconds)),
        pace: fmtPaceFromSecPerKm(pb.paceSecPerKm),
      })),
      predictions: predictions.map((prediction) => ({
        distance: prediction.label,
        time: fmtDuration(Math.round(prediction.seconds)),
        pace: fmtPaceFromSecPerKm(prediction.seconds / (prediction.distanceM / 1000)),
      })),
    },
    trends: {
      weeklyLoadKm: weeklyLoad.map((point) => ({ date: point.weekStart, km: round(point.km, 1) })),
      longRunsKm: longRunTrend.map((point) => ({ date: point.weekStart, km: round(point.longKm, 1) })),
      quarterlyPaceHr: quarterlyProgression.map((point) => ({
        label: point.period,
        pace: point.paceSecPerKm ? fmtPaceFromSecPerKm(point.paceSecPerKm) : null,
        hr: point.avgHr ? Math.round(point.avgHr) : null,
      })),
      yearlyPaceHr: yearlyProgression.map((point) => ({
        label: point.period,
        pace: point.paceSecPerKm ? fmtPaceFromSecPerKm(point.paceSecPerKm) : null,
        hr: point.avgHr ? Math.round(point.avgHr) : null,
      })),
    },
    evidence: {
      // Deliberately omit run.name: user-authored titles can embed locations or
      // people and add no analytical value. Keep free-text out of the LLM payload.
      recentRuns: runs.slice(0, 8).map((run) => ({
        date: run.start_date.slice(0, 10),
        distanceKm: km(run.distance),
        durationMin: nullableRound(run.moving_time / 60, 0),
        pace: run.avg_speed && run.avg_speed > 0 ? fmtPaceFromSecPerKm(1000 / run.avg_speed) : null,
        avgHr: run.avg_hr ? Math.round(run.avg_hr) : null,
        elevationM: run.elevation_gain ? Math.round(run.elevation_gain) : null,
      })),
      deterministicRecommendations: recommendations.map((recommendation) => `${recommendation.title}: ${recommendation.message}`),
      insights: insights.map((insight) => ({ title: insight.title, body: insight.message })),
      signalQuality: {
        hrRuns: signal ? signal.total - signal.missingHr : 0,
        paceRuns: signal ? signal.performanceEligible : 0,
        outdoorRuns: surfaces.find((surface) => surface.surface === "outdoor")?.runs ?? 0,
        indoorRuns: surfaces.find((surface) => surface.surface === "indoor")?.runs ?? 0,
      },
      surfaces: surfaces.map((surface) => ({
        surface: surface.surface,
        runs: surface.runs,
        km: surface.km,
        sharePct: surface.sharePct,
      })),
    },
  };
}
