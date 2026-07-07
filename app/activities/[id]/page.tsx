import Link from "next/link";
import { notFound } from "next/navigation";
import { getActivity, getStreams, getAthleteProfile } from "@/lib/db";
import { computeSplits, computeHrZones, computeDecoupling } from "@/lib/metrics/perRun";
import { gradeAdjustedSpeed, runningPowerAvg } from "@/lib/metrics/gap";
import { strideMetrics, splitBalance } from "@/lib/metrics/form";
import { climbingMetrics } from "@/lib/metrics/climbing";
import { DECOUPLING_THRESHOLD } from "@/lib/config";
import { fmtDistanceKm, fmtDuration, fmtPaceFromSpeed, fmtDateTime, fmtPaceFromSecPerKm } from "@/lib/format";
import SplitsChart from "@/components/charts/SplitsChart";
import ZonesChart from "@/components/charts/ZonesChart";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function ActivityDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { t } = await getT();
  const d = t.rd;
  const run = getActivity(Number(id));
  if (!run) notFound();

  const streams = getStreams(run.id);
  const splits = streams ? computeSplits(streams) : [];
  const zones = streams ? computeHrZones(streams) : null;
  const decoupling = streams ? computeDecoupling(streams) : null;

  const weightKg = getAthleteProfile()?.weightKg ?? 75;
  const gapSpeed = streams ? gradeAdjustedSpeed(streams) : null;
  const avgPower = streams ? runningPowerAvg(streams, weightKg) : null;
  const stride = streams ? strideMetrics(streams) : null;
  const balance = streams ? splitBalance(streams) : null;
  const climbing = streams ? climbingMetrics(streams) : null;
  const hasClimb = climbing != null && climbing.totalAscentM >= 20;
  const temps = streams?.temp?.filter((v) => Number.isFinite(v)) ?? [];
  const avgTemp = temps.length ? temps.reduce((s, v) => s + v, 0) / temps.length : null;
  const hasAdvanced = gapSpeed != null || avgPower != null || stride != null || balance != null || hasClimb || avgTemp != null;

  return (
    <div className="page-shell">
      <Link className="muted" href="/activities">&lt;- {d.back}</Link>
      <section className="hero-copy" style={{ minHeight: 300 }}>
        <div className="page-kicker">{d.kicker}</div>
        <h1>{run.name}</h1>
        <p className="page-sub">{fmtDateTime(run.start_date)}</p>
      </section>

      <div className="grid kpis">
        <div className="card kpi">
          <div className="label">{d.distance}</div>
          <div className="value">{fmtDistanceKm(run.distance)}</div>
        </div>
        <div className="card kpi">
          <div className="label">{d.duration}</div>
          <div className="value">{fmtDuration(run.moving_time)}</div>
        </div>
        <div className="card kpi">
          <div className="label">{d.avgPace}</div>
          <div className="value">{fmtPaceFromSpeed(run.avg_speed)}</div>
        </div>
        <div className="card kpi">
          <div className="label">{d.avgHr}</div>
          <div className="value">{run.avg_hr ? Math.round(run.avg_hr) + " bpm" : "—"}</div>
        </div>
        <div className="card kpi">
          <div className="label">{d.elevation}</div>
          <div className="value">{run.elevation_gain != null ? Math.round(run.elevation_gain) + " m" : "—"}</div>
        </div>
        {decoupling && (
          <div className="card kpi">
            <div className="label">{d.drift}</div>
            <div className="value">
              {decoupling.percent.toFixed(1)}%{" "}
              <span
                className={`pill ${decoupling.percent > DECOUPLING_THRESHOLD ? "warn" : "good"}`}
              >
                {decoupling.percent > DECOUPLING_THRESHOLD ? d.high : d.ok}
              </span>
            </div>
            <div className="sub">{d.driftSub}</div>
          </div>
        )}
      </div>

      {!streams ? (
        <div className="empty">
          {d.streamsEmpty}
        </div>
      ) : (
        <>
          {splits.length > 0 && (
            <>
              <div className="section-head">
                <div>
                  <h2>{d.splitsH2}</h2>
                  <p>{d.splitsSub}</p>
                </div>
              </div>
              <div className="panel chart-panel">
                <p className="panel-definition">
                  {d.splitsDef}
                </p>
                <SplitsChart splits={splits} />
              </div>
              <div className="panel flush table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{d.thKm}</th>
                      <th>{d.thPace}</th>
                      <th>{d.thAvgHr}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {splits.map((s) => (
                      <tr key={s.km}>
                        <td>{s.km}{s.distance < 950 ? d.partial : ""}</td>
                        <td>{fmtPaceFromSecPerKm(s.paceSecPerKm)}</td>
                        <td>{s.avgHr ? Math.round(s.avgHr) + " bpm" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {zones && (
            <>
              <div className="section-head">
                <div>
                  <h2>{d.zonesH2}</h2>
                  <p>{d.zonesSub}</p>
                </div>
              </div>
              <div className="panel chart-panel">
                <p className="panel-definition">
                  {d.zonesDef}
                </p>
                <ZonesChart zones={zones} />
              </div>
            </>
          )}

          {hasAdvanced && (
            <>
              <div className="section-head">
                <div>
                  <h2>{d.advH2}</h2>
                  <p>{d.advSub}</p>
                </div>
              </div>
              <div className="panel">
                <div className="panel-title">
                  <div>
                    <div className="label">{d.perRun}</div>
                    <h3>{d.effortForm}</h3>
                  </div>
                </div>
                <p className="panel-definition">
                  {d.advDefPre} <strong>{t.def.howToRead}</strong> {d.advDefPost}
                </p>
                <div className="stacked-stats">
                  {gapSpeed != null && (
                    <div className="micro-stat">
                      <div className="label">{d.gapPace}</div>
                      <div className="value">{fmtPaceFromSecPerKm(1000 / gapSpeed)}</div>
                      <div className="sub">{d.rawPace(fmtPaceFromSpeed(run.avg_speed))}</div>
                    </div>
                  )}
                  {avgPower != null && (
                    <div className="micro-stat">
                      <div className="label">{d.estPower}</div>
                      <div className="value">{Math.round(avgPower)} W</div>
                      <div className="sub">{d.bodyWeight(weightKg)}</div>
                    </div>
                  )}
                  {stride && (
                    <div className="micro-stat">
                      <div className="label">{d.cadence}</div>
                      <div className="value">{Math.round(stride.avgCadenceSpm)} spm</div>
                      <div className="sub">{d.strideSub(stride.avgStrideM.toFixed(2))}</div>
                    </div>
                  )}
                  {stride && (
                    <div className="micro-stat">
                      <div className="label">{d.cadenceDrift}</div>
                      <div className="value">
                        {stride.cadenceDriftPct > 0 ? "+" : ""}
                        {stride.cadenceDriftPct.toFixed(1)}%{" "}
                        <span className={`pill ${Math.abs(stride.cadenceDriftPct) > 5 ? "warn" : "good"}`}>
                          {Math.abs(stride.cadenceDriftPct) > 5 ? d.high : d.ok}
                        </span>
                      </div>
                      <div className="sub">{d.firstVsSecond}</div>
                    </div>
                  )}
                  {balance && (
                    <div className="micro-stat">
                      <div className="label">{d.splitBalance}</div>
                      <div className="value">
                        {fmtPaceFromSpeed(balance.firstHalfSpeed)} / {fmtPaceFromSpeed(balance.secondHalfSpeed)}
                      </div>
                      <div className="sub">
                        <span className={`pill ${balance.negativeSplit ? "good" : "info"}`}>
                          {balance.negativeSplit ? d.negSplit : d.posSplit}
                        </span>{" "}
                        {Math.abs(balance.driftPct).toFixed(1)}% {balance.negativeSplit ? d.faster : d.slower}
                      </div>
                    </div>
                  )}
                  {hasClimb && climbing && (
                    <div className="micro-stat">
                      <div className="label">{d.climbing}</div>
                      <div className="value">{climbing.vamMPerH != null ? `${Math.round(climbing.vamMPerH)} m/h` : "—"}</div>
                      <div className="sub">
                        {d.mUp(Math.round(climbing.totalAscentM))}
                        {climbing.uphillSpeed != null && climbing.flatSpeed != null && (
                          <> · {d.upVsFlat(fmtPaceFromSpeed(climbing.uphillSpeed), fmtPaceFromSpeed(climbing.flatSpeed))}</>
                        )}
                      </div>
                    </div>
                  )}
                  {avgTemp != null && (
                    <div className="micro-stat">
                      <div className="label">{d.temperature}</div>
                      <div className="value">
                        {avgTemp.toFixed(0)}&deg;C{" "}
                        <span className={`pill ${avgTemp >= 25 ? "warn" : "good"}`}>
                          {avgTemp >= 25 ? d.heat : d.ok}
                        </span>
                      </div>
                      <div className="sub">{d.heatNote}</div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
