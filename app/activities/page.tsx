import Link from "next/link";
import { getToken, listActivities } from "@/lib/db";
import { fmtDistanceKm, fmtDuration, fmtPaceFromSpeed, fmtPaceFromSecPerKm, fmtDateTime } from "@/lib/format";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function ActivitiesPage() {
  const { t } = await getT();
  const tr = t.runsPage;
  const connected = !!getToken();
  const runs = connected ? listActivities("Run") : [];
  const totalKm = runs.reduce((sum, r) => sum + r.distance / 1000, 0);
  const totalSeconds = runs.reduce((sum, r) => sum + r.moving_time, 0);
  const avgHrRuns = runs.filter((r) => r.avg_hr);
  const avgHr = avgHrRuns.length
    ? avgHrRuns.reduce((sum, r) => sum + (r.avg_hr ?? 0), 0) / avgHrRuns.length
    : null;
  const avgPaceSec = totalKm > 0 ? totalSeconds / totalKm : null;

  return (
    <div className="page-shell">
      <section className="hero-copy" style={{ minHeight: 260 }}>
        <div className="page-kicker">{tr.kicker}</div>
        <h1>{tr.title}</h1>
        <p className="page-sub">
          {tr.sub(runs.length)}
        </p>
      </section>

      {!connected ? (
        <div className="empty">
          {tr.connectEmptyPre} <Link href="/">{tr.connectEmptyLink}</Link>.
        </div>
      ) : runs.length === 0 ? (
        <div className="empty">
          {tr.noRunsPre} <Link href="/">{tr.connectEmptyLink}</Link>.
        </div>
      ) : (
        <>
          <div className="activity-rail">
            <div className="micro-stat">
              <div className="label">{tr.totalDistance}</div>
              <div className="value">{totalKm.toFixed(1)} km</div>
            </div>
            <div className="micro-stat">
              <div className="label">{tr.totalTime}</div>
              <div className="value">{fmtDuration(totalSeconds)}</div>
            </div>
            <div className="micro-stat">
              <div className="label">{tr.avgPace}</div>
              <div className="value">{avgPaceSec ? fmtPaceFromSecPerKm(avgPaceSec) : "—"}</div>
            </div>
            <div className="micro-stat">
              <div className="label">{tr.avgHr}</div>
              <div className="value">{avgHr ? `${Math.round(avgHr)} bpm` : "—"}</div>
            </div>
          </div>

          <div className="panel flush table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tr.th.date}</th>
                <th>{tr.th.name}</th>
                <th>{tr.th.distance}</th>
                <th>{tr.th.duration}</th>
                <th>{tr.th.pace}</th>
                <th>{tr.th.avgHr}</th>
                <th>{tr.th.elevation}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{fmtDateTime(r.start_date)}</td>
                  <td>
                    <Link className="run-link" href={`/activities/${r.id}`}>{r.name}</Link>
                  </td>
                  <td>{fmtDistanceKm(r.distance)}</td>
                  <td>{fmtDuration(r.moving_time)}</td>
                  <td>{fmtPaceFromSpeed(r.avg_speed)}</td>
                  <td>{r.avg_hr ? Math.round(r.avg_hr) + " bpm" : "—"}</td>
                  <td>{r.elevation_gain != null ? Math.round(r.elevation_gain) + " m" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  );
}
