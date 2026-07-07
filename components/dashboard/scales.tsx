import type { ReactNode } from "react";
import Link from "next/link";
import { fmtPaceFromSpeed } from "@/lib/format";
import type { Evidence } from "@/lib/insights/types";

// Presentational dashboard pieces extracted from the dashboard page. Each takes
// already-localized `labels` so it stays free of i18n plumbing and pure to render.

export function Definition({ children, label }: { children: ReactNode; label: string }) {
  return (
    <details className="metric-definition">
      <summary>{label}</summary>
      <p>{children}</p>
    </details>
  );
}

export function EvidenceItem({ e }: { e: Evidence }) {
  const body = (
    <>
      {e.label}
      {e.value ? <span className="muted"> · {e.value}</span> : null}
    </>
  );
  if (e.kind === "activity" && e.ref) {
    return (
      <li>
        <Link href={`/activities/${e.ref}`}>{body}</Link>
      </li>
    );
  }
  return <li>{body}</li>;
}

// Pace bands anchored to critical speed: easy ceiling, threshold band and CS.
export function CriticalPaceScale({
  cs,
  easyPace,
  thresholdLow,
  thresholdHigh,
  labels,
}: {
  cs: { cs: number; dPrime: number };
  easyPace: string;
  thresholdLow: string;
  thresholdHigh: string;
  labels: {
    slower: string;
    faster: string;
    moderate: string;
    threshold: string;
    interval: string;
    cs: string;
    easyCeiling: string;
  };
}) {
  const min = cs.cs * 0.8;
  const max = cs.cs * 1.12;
  const pct = (speed: number) => `${((speed - min) / (max - min)) * 100}%`;

  return (
    <div className="pace-scale" aria-label={labels.cs}>
      <div className="pace-scale-top">
        <span>{labels.slower}</span>
        <span>{labels.faster}</span>
      </div>
      <div className="pace-track">
        <div
          className="pace-segment moderate"
          style={{ left: pct(cs.cs * 0.8), width: `${((cs.cs * 0.1) / (max - min)) * 100}%` }}
        >
          <span>{labels.moderate}</span>
        </div>
        <div
          className="pace-segment threshold"
          style={{ left: pct(cs.cs * 0.9), width: `${((cs.cs * 0.1) / (max - min)) * 100}%` }}
        >
          <span>{labels.threshold}</span>
        </div>
        <div
          className="pace-segment interval"
          style={{ left: pct(cs.cs), width: `${((cs.cs * 0.12) / (max - min)) * 100}%` }}
        >
          <span>{labels.interval}</span>
        </div>
        <span className="pace-marker easy" style={{ left: "0%" }}>
          <b>{labels.easyCeiling}</b>
          <em>{easyPace}</em>
        </span>
        <span className="pace-marker cs" style={{ left: pct(cs.cs) }}>
          <b>{labels.cs}</b>
          <em>{fmtPaceFromSpeed(cs.cs)}</em>
        </span>
      </div>
      <div className="pace-scale-foot">
        <span>{labels.threshold}: {thresholdLow}-{thresholdHigh}</span>
        <span>D&apos; {Math.round(cs.dPrime)} m</span>
      </div>
    </div>
  );
}

// Heart-rate zone bands with the estimated LTHR marker.
export function HeartRateZoneScale({
  zones,
  lthr,
  labels,
}: {
  zones: { label: string; min: number; max: number | null }[];
  lthr: number;
  labels: { lower: string; higher: string; lthr: string };
}) {
  const markerIndex = zones.findIndex((zone) => zone.max === Math.round(lthr));
  const markerLeft = `${(((markerIndex >= 0 ? markerIndex : 3) + 1) / zones.length) * 100}%`;

  return (
    <div className="hr-zone-scale">
      <div className="pace-scale-top">
        <span>{labels.lower}</span>
        <span>{labels.higher}</span>
      </div>
      <div className="hr-zone-track">
        {zones.map((zone, index) => (
          <div key={zone.label} className={`hr-zone-cell z${index + 1}`}>
            <span>{zone.label}</span>
            <b>{zone.min}{zone.max != null ? `-${zone.max}` : "+"}</b>
          </div>
        ))}
        <span className="hr-marker" style={{ left: markerLeft }}>
          <b>{labels.lthr}</b>
          <em>{Math.round(lthr)} bpm</em>
        </span>
      </div>
    </div>
  );
}

// Fatigue-resistance bands (excellent → poor) with the recent-fade marker.
export function DurabilityScale({
  fade,
  runs,
  rating,
  labels,
}: {
  fade: number | null;
  runs: number;
  rating: string;
  labels: {
    stronger: string;
    fragile: string;
    excellent: string;
    good: string;
    moderate: string;
    poor: string;
    fade: string;
    longRuns: string;
    rating: string;
  };
}) {
  const maxFade = 14;
  const markerLeft = fade == null ? null : `${Math.max(0, Math.min(100, (fade / maxFade) * 100))}%`;

  return (
    <div className="durability-scale">
      <div className="pace-scale-top">
        <span>{labels.stronger}</span>
        <span>{labels.fragile}</span>
      </div>
      <div className="durability-track">
        <div className="durability-segment excellent"><span>{labels.excellent}</span></div>
        <div className="durability-segment good"><span>{labels.good}</span></div>
        <div className="durability-segment moderate"><span>{labels.moderate}</span></div>
        <div className="durability-segment poor"><span>{labels.poor}</span></div>
        {markerLeft ? (
          <span className="durability-marker" style={{ left: markerLeft }}>
            <b>{labels.fade}</b>
            <em>{fade?.toFixed(1)}%</em>
          </span>
        ) : null}
      </div>
      <div className="pace-scale-foot">
        <span>{labels.longRuns}: {runs}</span>
        <span>{labels.rating}: {rating}</span>
      </div>
    </div>
  );
}
