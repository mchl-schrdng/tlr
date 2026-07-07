import type { CSSProperties } from "react";
import { activityRawMap, getToken, listActivities, getStreams, getAthleteProfile } from "@/lib/db";
import { computeAcwr, weeklyVolume, personalBests } from "@/lib/metrics/aggregate";
import { vo2maxTrend } from "@/lib/metrics/fitnesstrend";
import { criticalSpeed, paceZonesFromCS } from "@/lib/metrics/criticalspeed";
import { intensityModel, injuryRisk } from "@/lib/metrics/form";
import { thresholdProfile } from "@/lib/metrics/threshold";
import { durabilitySummary } from "@/lib/metrics/durability";
import { powerCurve } from "@/lib/metrics/powercurve";
import { assessRunQuality, qualitySummary, surfaceSplitSummary } from "@/lib/metrics/quality";
import { computeDecoupling } from "@/lib/metrics/perRun";
import { estimateVdot, racePredictions } from "@/lib/metrics/vo2max";
import { buildInsights } from "@/lib/insights/engine";
import { coach } from "@/lib/coaching";
import {
  consistencySummary,
  dailyLoadMatrix,
  fitnessFatigueTrend,
  hardDayPattern,
  longTermPaceHrProgression,
  loadShape,
  paceHrPoints,
  qualifiedDecouplingTrend,
  weeklyLongRunTrend,
  weeklyLoadTrend,
  weeklyZoneDistribution,
} from "@/lib/metrics/dashboard";
import { ACWR_LOW, ACWR_HIGH, ACWR_DANGER } from "@/lib/config";
import {
  acwrPill,
  acwrCopy,
  riskPill,
  formCopy,
  signalCopy,
  driftCopy,
  hardSpacingCopy,
  signed,
  median,
  daysText,
  noHardDaysText,
  buildGreenPath,
  currentReadout,
  dashboardClock,
} from "@/lib/dashboard/status";
import { fmtDistanceKm, fmtDate, fmtDuration, fmtPaceFromSecPerKm, fmtPaceFromSpeed } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { isStravaConfigured } from "@/lib/strava/oauth";
import SyncButton from "@/components/SyncButton";
import Meter from "@/components/Meter";
import {
  Definition,
  EvidenceItem,
  CriticalPaceScale,
  HeartRateZoneScale,
  DurabilityScale,
} from "@/components/dashboard/scales";
import { buildRaceReadiness } from "@/lib/dashboard/readiness";
import TrainingLoadChart from "@/components/charts/TrainingLoadChart";
import PaceHrScatterChart from "@/components/charts/PaceHrScatterChart";
import FitnessFatigueChart from "@/components/charts/FitnessFatigueChart";
import Vo2maxTrendChart from "@/components/charts/Vo2maxTrendChart";
import ZoneStackChart from "@/components/charts/ZoneStackChart";
import LoadCalendar from "@/components/LoadCalendar";
import PaceHrProgressionChart from "@/components/charts/PaceHrProgressionChart";
import LongRunTrendChart from "@/components/charts/LongRunTrendChart";

function recentDecouplingMedian(ids: number[]): number | null {
  const vals: number[] = [];
  for (const id of ids.slice(0, 8)) {
    const stream = getStreams(id);
    if (!stream) continue;
    const decoupling = computeDecoupling(stream);
    if (decoupling) vals.push(decoupling.percent);
  }
  if (vals.length === 0) return null;
  vals.sort((a, b) => a - b);
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { t } = await getT();
  const configured = isStravaConfigured();
  const connected = !!getToken();
  const runs = connected ? listActivities("Run") : [];
  const now = dashboardClock(runs[0]);

  const totalMeters = runs.reduce((s, r) => s + (r.distance ?? 0), 0);
  const lastRun = runs[0];
  const rawById = connected ? activityRawMap() : new Map<number, unknown>();
  const signal = runs.length ? qualitySummary(runs, getStreams) : null;
  const performanceRuns = runs.filter((run) => assessRunQuality(run, getStreams(run.id)).validPerformance);
  const performanceStreams = performanceRuns
    .map((run) => getStreams(run.id))
    .filter((stream): stream is NonNullable<typeof stream> => stream !== null);
  const surfaces = runs.length ? surfaceSplitSummary(runs, rawById) : [];
  const indoor = surfaces.find((s) => s.surface === "indoor");
  const outdoor = surfaces.find((s) => s.surface === "outdoor");
  const acwr = runs.length ? computeAcwr(runs, now, getStreams) : null;
  const weeklyVolumeBuckets = runs.length ? weeklyVolume(runs, 1, now) : [];
  const thisWeekKm = weeklyVolumeBuckets[0]?.km ?? 0;
  const last28 = runs.filter((r) => now.getTime() - new Date(r.start_date).getTime() < 28 * 86400_000);
  const last28Km = last28.reduce((sum, r) => sum + r.distance / 1000, 0);
  const last28Seconds = last28.reduce((sum, r) => sum + r.moving_time, 0);
  const weeklyLoad = runs.length ? weeklyLoadTrend(runs, 12, now, getStreams) : [];
  const shape = runs.length ? loadShape(runs, now, getStreams) : null;
  const dailyLoad = runs.length ? dailyLoadMatrix(runs, 84, now, getStreams) : [];
  const scatter = paceHrPoints(runs, 120, getStreams);
  const qualifiedDrift = qualifiedDecouplingTrend(runs, getStreams, 8);
  const qualifiedDriftMedian = median(qualifiedDrift.map((point) => point.percent));
  const fitness = runs.length ? fitnessFatigueTrend(runs, 84, now, getStreams) : [];
  const latestFitness = fitness.at(-1);
  const form = latestFitness?.form ?? null;
  const weeklyZones = runs.length ? weeklyZoneDistribution(runs, getStreams, 8, now) : [];
  const latestZones = weeklyZones.at(-1);
  const hardPattern = runs.length ? hardDayPattern(runs, getStreams, 14, now) : null;
  const hardStatus = hardSpacingCopy(t, hardPattern);
  const hardMaxLoad = hardPattern ? Math.max(1, ...hardPattern.days.map((day) => day.load)) : 1;
  const longRunTrend = runs.length ? weeklyLongRunTrend(runs, 12, now) : [];
  const latestLongRun = longRunTrend.at(-1);
  const previousLongRun = longRunTrend.length > 1 ? longRunTrend.at(-2) : null;
  const longRunDelta = latestLongRun && previousLongRun ? latestLongRun.longKm - previousLongRun.longKm : null;
  const quarterlyProgression = runs.length ? longTermPaceHrProgression(runs, "quarter") : [];
  const yearlyProgression = runs.length ? longTermPaceHrProgression(runs, "year") : [];
  const zoneModel = intensityModel(
    latestZones ? [latestZones.z1, latestZones.z2, latestZones.z3, latestZones.z4, latestZones.z5] : [],
  );
  const consistency = runs.length ? consistencySummary(runs, now) : null;
  const risk = injuryRisk({
    acwr: acwr?.ratio ?? null,
    monotony: shape?.monotony ?? null,
    strain: shape?.strain ?? null,
    rampPct: shape?.rampPct ?? null,
  });

  const pbs = connected && performanceStreams.length ? personalBests(performanceStreams) : [];
  const best5k = pbs.find((pb) => pb.distanceM === 5000);
  const refPb =
    best5k ??
    pbs.find((pb) => pb.distanceM === 10000) ??
    pbs.find((pb) => pb.distanceM === 1000) ??
    null;
  const vdot = refPb ? estimateVdot(refPb.distanceM, refPb.seconds) : null;
  const predictions = refPb ? racePredictions(refPb.distanceM, refPb.seconds) : [];
  const vo2Five = performanceRuns.length ? vo2maxTrend(performanceRuns, getStreams, 5000, 56) : [];
  const vo2One =
    vo2Five.length >= 4
      ? vo2Five
      : performanceRuns.length
        ? vo2maxTrend(performanceRuns, getStreams, 1000, 42)
        : [];
  const vo2Target = vo2Five.length >= 4 ? "5K" : "1K";
  const cs = performanceStreams.length ? criticalSpeed(performanceStreams) : null;
  const csZones = cs ? paceZonesFromCS(cs.cs) : [];
  const threshold = runs.length ? thresholdProfile(runs, performanceStreams) : null;
  const weightKg = getAthleteProfile()?.weightKg ?? 75;
  const powerPoints = performanceStreams.length ? powerCurve(performanceStreams, weightKg) : [];
  const powerLabel: Record<number, string> = { 5: "5s", 30: "30s", 60: "1min", 300: "5min", 600: "10min", 1200: "20min" };
  const durability = runs.length ? durabilitySummary(runs, getStreams) : null;
  const durabilityPill: Record<string, string> = { excellent: "good", good: "good", moderate: "warn", poor: "bad", unknown: "warn" };
  const thresholdZone = csZones.find((z) => z.label === "Threshold");
  const easyZone = csZones.find((z) => z.label === "Easy");
  const recentDrift = qualifiedDriftMedian ?? (performanceRuns.length ? recentDecouplingMedian(performanceRuns.map((r) => r.id)) : null);
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

  const pill = acwrPill(t, acwr?.ratio ?? null);
  const status = acwrCopy(t, acwr?.ratio ?? null);
  const riskLabel = riskPill(t, risk.level);
  const formStatus = formCopy(t, form);
  const signalStatus = signalCopy(t, signal?.performanceEligible ?? 0, signal?.total ?? 0);
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
      noData: "—",
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

  return (
    <div className="page-shell">
      {sp.error && (
        <div className="notice err">{t.connect.error(decodeURIComponent(sp.error))}</div>
      )}
      {sp.connected && <div className="notice ok">{t.connect.connected}</div>}

      {!connected && !configured ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{t.connect.configRequired}</h2>
          <p className="muted">{t.connect.configIntro}</p>
          <ol className="muted" style={{ lineHeight: 1.8 }}>
            <li>{t.connect.step1open} <a href="https://www.strava.com/settings/api" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>strava.com/settings/api</a> {t.connect.step1rest}</li>
            <li>{t.connect.step2}</li>
            <li>{t.connect.step3}</li>
            <li>{t.connect.step4}</li>
          </ol>
        </div>
      ) : !connected ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <h2 style={{ marginTop: 0 }}>{t.connect.connectTitle}</h2>
          <p className="muted" style={{ maxWidth: 460, margin: "0 auto 24px" }}>
            {t.connect.connectBody}
          </p>
          <a className="btn" href="/api/auth/strava">{t.connect.connectCta}</a>
        </div>
      ) : runs.length === 0 ? (
        <>
          <section className="dash-header">
            <div>
              <div className="page-kicker">{t.hero.kicker}</div>
              <h1>{t.hero.title}</h1>
              <p className="page-sub">{t.hero.emptySub}</p>
            </div>
            <div className="dash-actions">
              <SyncButton label={t.hero.sync} />
              <SyncButton full label={t.hero.fullResync} />
            </div>
          </section>
          <div className="empty">
            {t.hero.noRunsPre} <strong>{t.hero.sync}</strong> {t.hero.noRunsPost}
          </div>
        </>
      ) : (
        <>
          <section className="dash-header">
            <div>
              <div className="page-kicker">{t.hero.kicker}</div>
              <h1>{t.hero.title}</h1>
              <p className="page-sub">
                {t.hero.aliveSub(runs.length, fmtDistanceKm(totalMeters), lastRun ? fmtDate(lastRun.start_date) : "—", fmtDate(now.toISOString()))}
              </p>
            </div>
            <div className="dash-actions">
              <SyncButton label={t.hero.sync} />
              <SyncButton full label={t.hero.fullResync} />
            </div>
          </section>

          <section className={`readout-panel ${readout.cls}`}>
            <div className="readout-main">
              <div className="readout-kicker">{readout.label} · no LLM</div>
              <h2>{readout.title}</h2>
              <p>{readout.body}</p>
              <div className="readout-action">{greenPath.action}</div>
              <div className="green-path">
                <div className="label">{t.lbl.pathToGreen}</div>
                <strong>{greenPath.title}</strong>
                <p>{greenPath.checkpoint}</p>
              </div>
            </div>
            <div className="readout-facts">
              <div className="micro-stat">
                <div className="label">{t.lbl.load}</div>
                <div className="value">{acwr?.ratio != null ? acwr.ratio.toFixed(2) : "—"}</div>
                <div className="sub">{status.label} · {daysText(t, greenPath.loadDays)}</div>
              </div>
              <div className="micro-stat">
                <div className="label">{t.lbl.form}</div>
                <div className="value">{signed(form, 1)}</div>
                <div className="sub">{formStatus.label} · {daysText(t, greenPath.formDays)}</div>
              </div>
              <div className="micro-stat">
                <div className="label">{t.lbl.intensity}</div>
                <div className="value">{hardPattern ? `${hardPattern.hardDays}/14` : "—"}</div>
                <div className="sub">{hardPattern ? `${hardPattern.hardRuns} hard runs` : hardStatus.label} · {noHardDaysText(t, greenPath.spacingDays)}</div>
              </div>
              <div className="micro-stat">
                <div className="label">{t.lbl.durability}</div>
                <div className="value">{recentDrift != null ? `${recentDrift.toFixed(1)}%` : "—"}</div>
                <div className="sub">next easy run target &lt;5%</div>
              </div>
            </div>
          </section>

          <section className="decision-grid">
            <div className="panel decision-card decision-primary">
              <div className="panel-title">
                <div>
                  <div className="label">{t.lbl.loadStatus}</div>
                  <h3>{status.label}</h3>
                </div>
                <span className={`pill ${status.cls}`}>{pill.text}</span>
              </div>
              <div className="decision-number mono">{acwr?.ratio != null ? acwr.ratio.toFixed(2) : "—"}</div>
              <Meter value={acwr?.ratio ?? null} min={0} max={2} ticks={[0.8, 1.3, 1.5]}
                zones={[{ upTo: 0.8, tone: "warn" }, { upTo: 1.3, tone: "good" }, { upTo: 1.5, tone: "warn" }, { upTo: 2, tone: "bad" }]} />
              <p className="decision-copy">{status.line}</p>
              <div className="mini-grid">
                <div className="micro-stat">
                  <div className="label">{t.lbl.thisWeek}</div>
                  <div className="value">{thisWeekKm.toFixed(1)} km</div>
                </div>
                <div className="micro-stat">
                  <div className="label">{t.lbl.ramp}</div>
                  <div className="value">{shape?.rampPct != null ? `${shape.rampPct > 0 ? "+" : ""}${Math.round(shape.rampPct)}%` : "—"}</div>
                </div>
                <div className="micro-stat">
                  <div className="label">{t.lbl.monotony}</div>
                  <div className="value">{shape?.monotony != null ? shape.monotony.toFixed(2) : "—"}</div>
                </div>
                <div className="micro-stat">
                  <div className="label">{t.lbl.last28}</div>
                  <div className="value">{last28Km.toFixed(1)} km</div>
                </div>
              </div>
              <Definition label={t.common.definition}>
                ACWR is 7-day average training load divided by 28-day average load. Load is TRIMP from heart-rate streams when available, otherwise Strava Relative Effort or moving minutes. Target zone: {ACWR_LOW}-{ACWR_HIGH}; above {ACWR_DANGER} is overload.
              </Definition>
            </div>

            <div className="panel decision-card">
              <div className="panel-title">
                <div>
                  <div className="label">{t.lbl.form}</div>
                  <h3>{formStatus.label}</h3>
                </div>
                <span className={`pill ${formStatus.cls}`}>{formStatus.label}</span>
              </div>
              <div className="decision-number mono">{signed(form, 1)}</div>
              <Meter value={form} min={-40} max={40} ticks={[-20, -10, 25]}
                zones={[{ upTo: -20, tone: "bad" }, { upTo: -10, tone: "warn" }, { upTo: 25, tone: "good" }, { upTo: 40, tone: "warn" }]} />
              <p className="decision-copy">{formStatus.line}</p>
              <div className="stacked-stats compact">
                <div className="micro-stat">
                  <div className="label">{t.lbl.fitness}</div>
                  <div className="value">{latestFitness ? latestFitness.fitness.toFixed(1) : "—"}</div>
                </div>
                <div className="micro-stat">
                  <div className="label">{t.lbl.fatigue}</div>
                  <div className="value">{latestFitness ? latestFitness.fatigue.toFixed(1) : "—"}</div>
                </div>
                <div className="micro-stat">
                  <div className="label">{t.lbl.last28}</div>
                  <div className="value">{last28Km.toFixed(1)} km</div>
                  <div className="sub">{fmtDuration(last28Seconds)}</div>
                </div>
              </div>
              <Definition label={t.common.definition}>{t.def.fitnessFatigue}</Definition>
            </div>

            <div className="panel decision-card">
              <div className="panel-title">
                <div>
                  <div className="label">{t.lbl.intensitySpacing}</div>
                  <h3>{hardStatus.label}</h3>
                </div>
                <span className={`pill ${hardStatus.cls}`}>{hardPattern ? t.lbl.days14(hardPattern.hardDays) : "—"}</span>
              </div>
              <div className="decision-number mono">{hardPattern ? hardPattern.hardRuns : "—"}</div>
              <Meter value={hardPattern ? hardPattern.hardDays : null} min={0} max={14} ticks={[3, 5]}
                zones={[{ upTo: 3, tone: "good" }, { upTo: 5, tone: "warn" }, { upTo: 14, tone: "bad" }]} />
              <p className="decision-copy">{hardStatus.line}</p>
              {hardPattern && (
                <div className="day-strip" aria-label="Last 14 days intensity">
                  {hardPattern.days.map((day) => (
                    <span
                      key={day.date}
                      className={`day-chip ${day.hardCount > 0 ? "hard" : day.count > 0 ? "easy" : ""}`}
                      style={{ "--day-load": `${Math.min(100, Math.round((day.load / hardMaxLoad) * 100))}%` } as CSSProperties}
                      title={`${day.date}: ${day.count} run(s), ${day.hardCount} hard`}
                    />
                  ))}
                </div>
              )}
              <div className="mini-grid">
                <div className="micro-stat">
                  <div className="label">{t.lbl.hardRuns}</div>
                  <div className="value">{hardPattern ? hardPattern.hardRuns : "—"}</div>
                </div>
                <div className="micro-stat">
                  <div className="label">{t.lbl.backToBack}</div>
                  <div className="value">{hardPattern ? hardPattern.backToBackHardDays : "—"}</div>
                </div>
              </div>
              <Definition label={t.common.definition}>
                {t.def.hardRun}
              </Definition>
            </div>

            <div className="panel decision-card">
              <div className="panel-title">
                <div>
                  <div className="label">{t.lbl.durability}</div>
                  <h3>{driftStatus.label}</h3>
                </div>
                <span className={`pill ${driftStatus.cls}`}>qualified drift</span>
              </div>
              <div className="decision-number mono">{recentDrift != null ? `${recentDrift.toFixed(1)}%` : "—"}</div>
              <Meter value={recentDrift} min={0} max={12} ticks={[5, 8]}
                zones={[{ upTo: 5, tone: "good" }, { upTo: 8, tone: "warn" }, { upTo: 12, tone: "bad" }]} />
              <p className="decision-copy">{driftStatus.line}</p>
              <div className="mini-grid">
                <div className="micro-stat">
                  <div className="label">{t.lbl.samples}</div>
                  <div className="value">{qualifiedDrift.length}</div>
                </div>
                <div className="micro-stat">
                  <div className="label">{t.lbl.target}</div>
                  <div className="value">&lt;5%</div>
                </div>
                <div className="micro-stat">
                  <div className="label">{t.lbl.minRun}</div>
                  <div className="value">5 km</div>
                </div>
                <div className="micro-stat">
                  <div className="label">{t.lbl.pauseCap}</div>
                  <div className="value">15%</div>
                </div>
              </div>
              <Definition label={t.common.definition}>
                {t.def.qualifiedDrift}
              </Definition>
            </div>
          </section>

          <section className="section-head">
            <div>
              <h2>{t.sections.trainingStructure}</h2>
              <p>{t.subs.trainingStructure}</p>
            </div>
          </section>

          <section className="analytics-grid lean-grid">
            <div className="panel chart-panel span-2">
              <div className="panel-title">
                <div>
                  <div className="label">{t.lbl.primaryTrend}</div>
                  <h3>{t.lbl.fitnessFatigueForm}</h3>
                </div>
                <span className={`pill ${formStatus.cls}`}>{formStatus.label}</span>
              </div>
              <FitnessFatigueChart points={fitness} />
              <Definition label={t.common.definition}>
                {t.def.fitnessFatigue}
              </Definition>
            </div>

            <div className="panel chart-panel">
              <div className="panel-title">
                <div>
                  <div className="label">{t.lbl.longRunAnchor}</div>
                  <h3>{t.lbl.longestRun}</h3>
                </div>
                <span className="pill info">{longRunDelta != null ? signed(longRunDelta, 1) : "12 weeks"}</span>
              </div>
              <LongRunTrendChart weeks={longRunTrend} />
              <div className="mini-grid">
                <div className="micro-stat">
                  <div className="label">{t.lbl.thisWeek}</div>
                  <div className="value">{latestLongRun ? `${latestLongRun.longKm.toFixed(1)} km` : "—"}</div>
                </div>
                <div className="micro-stat">
                  <div className="label">{t.lbl.share}</div>
                  <div className="value">{latestLongRun?.longSharePct != null ? `${latestLongRun.longSharePct}%` : "—"}</div>
                </div>
              </div>
              <Definition label={t.common.definition}>
                {t.def.longestRun}
              </Definition>
            </div>

            <div className="panel chart-panel span-2">
              <div className="panel-title">
                <div>
                  <div className="label">{t.lbl.load}</div>
                  <h3>{t.lbl.weeklyLoad}</h3>
                </div>
                <span className={`pill ${riskLabel.cls}`}>{riskLabel.text}</span>
              </div>
              <TrainingLoadChart weeks={weeklyLoad} />
              <Definition label={t.common.definition}>
                {t.def.weeklyLoad}
              </Definition>
            </div>

            <div className="panel chart-panel">
              <div className="panel-title">
                <div>
                  <div className="label">{t.lbl.intensity}</div>
                  <h3>{t.lbl.intensityByWeek}</h3>
                </div>
                <span className="pill info">{zoneModel.model}</span>
              </div>
              <ZoneStackChart weeks={weeklyZones} />
              <div className="mini-grid">
                <div className="micro-stat">
                  <div className="label">{t.lbl.easy}</div>
                  <div className="value">{latestZones ? Math.round(latestZones.easyPct) : "—"}%</div>
                </div>
                <div className="micro-stat">
                  <div className="label">{t.lbl.hard}</div>
                  <div className="value">{latestZones ? Math.round(latestZones.hardPct) : "—"}%</div>
                </div>
              </div>
              <Definition label={t.common.definition}>
                {t.def.weeklyZones}
              </Definition>
            </div>
          </section>

          <section className="section-head">
            <div>
              <h2>{t.sections.diagnostics}</h2>
              <p>{t.subs.diagnostics}</p>
            </div>
          </section>

          <section className="analytics-grid lean-grid">
            <div className="panel chart-panel">
              <div className="panel-title">
                <div>
                  <div className="label">{t.lbl.signalQuality}</div>
                  <h3>{signal ? `${signal.performanceEligible}/${signal.total}` : "—"}</h3>
                </div>
                <span className={`pill ${signalStatus.cls}`}>{signalStatus.label}</span>
              </div>
              <div className="signal-number mono">
                {signal && signal.total > 0 ? `${Math.round((signal.performanceEligible / signal.total) * 100)}%` : "—"}
              </div>
              <p className="decision-copy">
                Performance charts ignore tiny runs, high-pause activities and missing distance streams.
              </p>
              <div className="mini-grid">
                <div className="micro-stat">
                  <div className="label">{t.lbl.indoor}</div>
                  <div className="value">{indoor ? `${indoor.sharePct.toFixed(1)}%` : "—"}</div>
                  <div className="sub">{indoor ? fmtPaceFromSecPerKm(indoor.avgPaceSecPerKm ?? 0) : "—"}</div>
                </div>
                <div className="micro-stat">
                  <div className="label">{t.lbl.outdoor}</div>
                  <div className="value">{outdoor ? `${outdoor.sharePct.toFixed(1)}%` : "—"}</div>
                  <div className="sub">{outdoor ? `${Math.round(outdoor.elevationM)} m D+` : "—"}</div>
                </div>
                <div className="micro-stat">
                  <div className="label">{t.lbl.excluded}</div>
                  <div className="value">{signal ? signal.excluded : "—"}</div>
                </div>
                <div className="micro-stat">
                  <div className="label">{t.lbl.pauseOutliers}</div>
                  <div className="value">{signal ? signal.pauseOutliers : "—"}</div>
                </div>
              </div>
              <Definition label={t.common.definition}>
                {t.def.signalQuality}
              </Definition>
            </div>

            <div className="panel chart-panel span-2">
              <div className="panel-title">
                <div>
                  <div className="label">{t.lbl.recoveryRhythm}</div>
                  <h3>{t.lbl.loadCalendar}</h3>
                </div>
                <span className="pill good">84 days</span>
              </div>
              <LoadCalendar days={dailyLoad} />
              <div className="mini-grid">
                <div className="micro-stat">
                  <div className="label">{t.lbl.runDays}</div>
                  <div className="value">{consistency ? `${consistency.runDays28}/28` : "—"}</div>
                </div>
                <div className="micro-stat">
                  <div className="label">{t.lbl.longRunShare}</div>
                  <div className="value">{consistency?.longRunSharePct28 != null ? `${consistency.longRunSharePct28}%` : "—"}</div>
                </div>
              </div>
              <Definition label={t.common.definition}>
                {t.def.loadCalendar}
              </Definition>
            </div>

            <div className="panel signal-panel">
              <div className="panel-title">
                <div>
                  <div className="label">{t.panels.paceRx}</div>
                  <h3>{t.panels.criticalSpeed}</h3>
                </div>
              </div>
              <div className="signal-number mono">{cs ? fmtPaceFromSpeed(cs.cs) : "—"}</div>
              {cs && easyZone && thresholdZone ? (
                <CriticalPaceScale
                  cs={cs}
                  easyPace={fmtPaceFromSpeed(easyZone.maxSpeed)}
                  thresholdLow={fmtPaceFromSpeed(thresholdZone.maxSpeed)}
                  thresholdHigh={fmtPaceFromSpeed(thresholdZone.minSpeed)}
                  labels={t.scale.critical}
                />
              ) : null}
              <Definition label={t.common.definition}>
                {t.def.criticalSpeed}
              </Definition>
            </div>

            <div className="panel signal-panel">
              <div className="panel-title">
                <div>
                  <div className="label">{t.panels.yourPhysiology}</div>
                  <h3>{t.panels.hrZones}</h3>
                </div>
                {threshold?.source === "estimated" && <span className="pill good">measured</span>}
              </div>
              <div className="signal-number mono">{threshold?.lthr ? `${Math.round(threshold.lthr)}` : "—"}<span className="label"> bpm LTHR</span></div>
              {threshold?.zones && threshold.lthr ? (
                <HeartRateZoneScale zones={threshold.zones} lthr={threshold.lthr} labels={t.scale.hr} />
              ) : (
                <div className="stacked-stats compact">
                  <div className="micro-stat">
                    <div className="label">{t.kpi.maxHr}</div>
                    <div className="value">{threshold?.maxHr ? `${threshold.maxHr}` : "—"}</div>
                  </div>
                </div>
              )}
              <Definition label={t.common.definition}>
                {t.def.hrZones(threshold?.maxHr ? `${threshold.maxHr} bpm` : "—", threshold?.zones ? `${threshold.zones[1].max} bpm` : "threshold")}
              </Definition>
            </div>

            <div className="panel signal-panel">
              <div className="panel-title">
                <div>
                  <div className="label">{t.panels.fatigueResistance}</div>
                  <h3>{t.panels.durability}</h3>
                </div>
                {durability && durability.rating !== "unknown" && (
                  <span className={`pill ${durabilityPill[durability.rating]}`}>{durability.rating}</span>
                )}
              </div>
              <div className="signal-number mono">
                {durability?.medianFadePct != null ? `${durability.medianFadePct.toFixed(1)}%` : "—"}
              </div>
              <DurabilityScale
                fade={durability?.medianFadePct ?? null}
                runs={durability?.runs ?? 0}
                rating={durability?.rating ?? "—"}
                labels={t.scale.durability}
              />
              <Definition label={t.common.definition}>
                {t.def.durability}
              </Definition>
            </div>

            {powerPoints.length > 0 && (
              <div className="panel signal-panel">
                <div className="panel-title">
                  <div>
                    <div className="label">{t.panels.estRunningPower}</div>
                    <h3>{t.panels.powerCurve}</h3>
                  </div>
                </div>
                <div className="stacked-stats compact">
                  {powerPoints.map((p) => (
                    <div key={p.sec} className="micro-stat">
                      <div className="label">{powerLabel[p.sec] ?? `${p.sec}s`}</div>
                      <div className="value">{p.watts}<span className="label"> W</span></div>
                    </div>
                  ))}
                </div>
                <Definition label={t.common.definition}>
                  {t.def.powerCurvePre} <strong>{t.def.howToRead}</strong> {t.def.powerCurveHow}
                </Definition>
              </div>
            )}

            <div className="panel chart-panel span-2">
              <div className="panel-title">
                <div>
                  <div className="label">{t.perf.efficiency}</div>
                  <h3>{t.panels.paceVsHr}</h3>
                </div>
              </div>
              <PaceHrScatterChart points={scatter} />
              <Definition label={t.common.definition}>
                {t.def.efficiency}
              </Definition>
            </div>
          </section>

          <section className="section-head">
            <div>
              <h2>{t.sections.performanceLab}</h2>
              <p>{t.perf.sectionSub}</p>
            </div>
          </section>

          <section className="analytics-grid lean-grid">
            <div className="panel chart-panel">
              <div className="panel-title">
                <div>
                  <div className="label">{t.perf.vo2Engine}</div>
                  <h3>{t.perf.vo2maxTrend}</h3>
                </div>
                <span className="pill info">{t.perf.rollingBest(vo2Target)}</span>
              </div>
              <Vo2maxTrendChart points={vo2One} labels={t.scale.vo2} />
              <Definition label={t.common.definition}>
                {t.def.vo2(vo2Target)}
              </Definition>
            </div>

            <div className="panel chart-panel span-2">
              <div className="panel-title">
                <div>
                  <div className="label">{t.perf.allHistory}</div>
                  <h3>{t.perf.paceHr}</h3>
                </div>
                <span className="pill info">{t.perf.quarterYear}</span>
              </div>
              <PaceHrProgressionChart quarterly={quarterlyProgression} yearly={yearlyProgression} />
              <Definition label={t.common.definition}>
                {t.def.allHistory}
              </Definition>
            </div>

            <div className="panel race-model-panel span-3">
              <div className="panel-title">
                <div>
                  <div className="label">{t.perf.raceModel}</div>
                  <h3>{t.perf.recordsPredictions}</h3>
                </div>
                {vdot != null && <span className="pill info">VDOT {vdot.toFixed(1)}</span>}
              </div>
              <div className="race-model-grid">
                <div className="stacked-stats compact race-records">
                  {pbs.map((pb) => (
                    <div key={pb.distanceM} className="micro-stat">
                      <div className="label">{t.perf.kBest(pb.distanceM / 1000)}</div>
                      <div className="value mono">{fmtDuration(Math.round(pb.seconds))}</div>
                      <div className="sub">{fmtPaceFromSecPerKm(pb.paceSecPerKm)}</div>
                    </div>
                  ))}
                  {predictions.map((p) => (
                    <div key={p.label} className="micro-stat">
                      <div className="label">{t.perf.predicted(p.label)}</div>
                      <div className="value mono">{fmtDuration(Math.round(p.seconds))}</div>
                      <div className="sub">{fmtPaceFromSecPerKm(p.seconds / (p.distanceM / 1000))}</div>
                    </div>
                  ))}
                </div>

                <div className={`race-readiness-card ${raceReadiness.cls}`}>
                  <div className="readiness-head">
                    <div>
                      <div className="label">{t.perf.raceReadiness}</div>
                      <h4>{raceReadiness.label}</h4>
                    </div>
                    <div className="readiness-gauge" style={{ "--readiness": `${raceReadiness.score}%` } as CSSProperties}>
                      <span>{raceReadiness.score}</span>
                      <em>/100</em>
                    </div>
                  </div>
                  <p>{raceReadiness.line}</p>
                  <div className="readiness-limiter">
                    <span className="label">{t.perf.currentLimiter}</span>
                    <strong>{raceReadiness.limiter}</strong>
                  </div>
                  <div className="readiness-factors" aria-label={t.perf.readinessFactors}>
                    {raceReadiness.factors.map((factor) => (
                      <div key={factor.label} className="readiness-factor" style={{ "--factor": `${factor.score}%` } as CSSProperties}>
                        <span>{factor.label}</span>
                        <b>{factor.value}</b>
                        <i />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <Definition label={t.common.definition}>
                {t.def.raceModel} {t.def.raceReadiness}
              </Definition>
            </div>
          </section>

          {recommendations.length > 0 && (
            <>
              <section className="section-head">
                <div>
                  <h2>{t.sections.coaching}</h2>
                  <p>{t.perf.coachingSub}</p>
                </div>
              </section>
              <div className="grid" style={{ gridTemplateColumns: "1fr", gap: 12, marginBottom: 8 }}>
                {recommendations.map((r, i) => (
                  <div key={i} className="card" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <span className={`pill ${r.level}`} style={{ marginTop: 2 }}>
                      {t.severity[r.level]}
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{r.title}</div>
                      <div className="muted" style={{ fontSize: 14 }}>{r.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {insights.length > 0 && (
            <>
              <section className="section-head">
                <div>
                  <h2>{t.sections.evidenceFeed}</h2>
                  <p>{t.perf.evidenceSub}</p>
                </div>
              </section>
              <div className="grid" style={{ gridTemplateColumns: "1fr", gap: 16 }}>
                {insights.map((i) => (
                  <div key={i.id} className="card">
                    <div className="evidence-card-head">
                      <span className={`pill ${i.severity}`}>{t.severity[i.severity]}</span>
                      <strong>{i.title}</strong>
                      {i.metric && (
                        <span className="muted evidence-metric">
                          {i.metric.label}: <strong>{i.metric.value}</strong>
                        </span>
                      )}
                    </div>
                    <p style={{ margin: "10px 0" }}>{i.message}</p>
                    <p style={{ margin: "0 0 10px" }}>
                      <strong>{t.common.doLabel}</strong> {i.action}
                    </p>
                    <details>
                      <summary className="muted" style={{ cursor: "pointer" }}>
                        {t.common.evidence(i.evidence.length)}
                      </summary>
                      <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                        {i.evidence.map((e, k) => (
                          <EvidenceItem key={k} e={e} />
                        ))}
                      </ul>
                      {i.formula && (
                        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                          {i.formula}
                        </p>
                      )}
                    </details>
                  </div>
                ))}
              </div>
            </>
          )}

        </>
      )}
    </div>
  );
}
