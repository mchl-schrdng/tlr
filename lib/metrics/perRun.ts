import type { StreamSet } from "@/lib/db";
import { HR_MAX, ZONE_BOUNDS, ZONE_LABELS } from "@/lib/config";

// A per-sample segment between two consecutive stream points.
type Segment = {
  dtSec: number; // duration of the segment
  dDist: number; // distance covered (m)
  hr: number | null; // representative HR over the segment
  distMid: number; // cumulative distance at segment midpoint (m)
};

// Turn raw parallel arrays into segments, filtering out non-moving/garbage points.
export function toSegments(s: StreamSet): Segment[] {
  const time = s.time;
  const dist = s.distance;
  if (!time || !dist || time.length < 2) return [];
  const hr = s.heartrate;
  const segs: Segment[] = [];
  for (let i = 1; i < time.length; i++) {
    const dtSec = time[i] - time[i - 1];
    const dDist = dist[i] - dist[i - 1];
    if (dtSec <= 0 || dDist < 0) continue; // clock/GPS glitch
    const h =
      hr && hr[i] != null && hr[i - 1] != null ? (hr[i] + hr[i - 1]) / 2 : null;
    segs.push({ dtSec, dDist, hr: h, distMid: (dist[i] + dist[i - 1]) / 2 });
  }
  return segs;
}

export type Split = {
  km: number; // 1-based km index (last may be partial)
  distance: number; // meters in this split
  seconds: number; // time in this split
  paceSecPerKm: number; // normalized pace
  avgHr: number | null;
};

// Per-kilometer splits derived from segments.
export function computeSplits(s: StreamSet): Split[] {
  const segs = toSegments(s);
  if (segs.length === 0) return [];
  const buckets = new Map<number, { dist: number; sec: number; hrWeighted: number; hrTime: number }>();
  for (const seg of segs) {
    const km = Math.floor(seg.distMid / 1000); // 0-based bucket
    const b = buckets.get(km) ?? { dist: 0, sec: 0, hrWeighted: 0, hrTime: 0 };
    b.dist += seg.dDist;
    b.sec += seg.dtSec;
    if (seg.hr != null) {
      b.hrWeighted += seg.hr * seg.dtSec;
      b.hrTime += seg.dtSec;
    }
    buckets.set(km, b);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([km, b]) => ({
      km: km + 1,
      distance: b.dist,
      seconds: b.sec,
      paceSecPerKm: b.dist > 0 ? (b.sec / b.dist) * 1000 : 0,
      avgHr: b.hrTime > 0 ? b.hrWeighted / b.hrTime : null,
    }));
}

export type ZoneTime = { label: string; seconds: number; zone: number };

// Time spent in each of the 5 HR zones (needs heart-rate stream). null if no HR.
export function computeHrZones(s: StreamSet, hrMax = HR_MAX): ZoneTime[] | null {
  const segs = toSegments(s).filter((seg) => seg.hr != null);
  if (segs.length === 0) return null;
  const seconds = ZONE_LABELS.map(() => 0);
  for (const seg of segs) {
    const frac = (seg.hr as number) / hrMax;
    // Largest zone index whose lower bound is satisfied (clamped to [0, last]).
    let z = 0;
    for (let i = 0; i < ZONE_LABELS.length; i++) {
      if (frac >= ZONE_BOUNDS[i]) z = i;
    }
    seconds[z] += seg.dtSec;
  }
  return ZONE_LABELS.map((label, i) => ({ label, seconds: seconds[i], zone: i + 1 }));
}

export type Decoupling = {
  percent: number; // >0 means HR drifted up (efficiency dropped) in 2nd half
  firstHalfEf: number;
  secondHalfEf: number;
};

// Aerobic decoupling: efficiency factor (speed/HR) of 2nd half vs 1st half.
export function computeDecoupling(s: StreamSet): Decoupling | null {
  const segs = toSegments(s).filter((seg) => seg.hr != null && seg.hr > 0);
  if (segs.length < 4) return null;
  const totalTime = segs.reduce((sum, seg) => sum + seg.dtSec, 0);
  const halfTime = totalTime / 2;

  let acc = 0;
  const first: Segment[] = [];
  const second: Segment[] = [];
  for (const seg of segs) {
    if (acc < halfTime) first.push(seg);
    else second.push(seg);
    acc += seg.dtSec;
  }
  if (first.length === 0 || second.length === 0) return null;

  const ef = (arr: Segment[]): number => {
    const t = arr.reduce((s, x) => s + x.dtSec, 0);
    const d = arr.reduce((s, x) => s + x.dDist, 0);
    const hr = arr.reduce((s, x) => s + (x.hr as number) * x.dtSec, 0) / t;
    const speed = d / t; // m/s
    return hr > 0 ? speed / hr : 0;
  };
  const firstHalfEf = ef(first);
  const secondHalfEf = ef(second);
  if (firstHalfEf <= 0) return null;
  return {
    percent: ((firstHalfEf - secondHalfEf) / firstHalfEf) * 100,
    firstHalfEf,
    secondHalfEf,
  };
}
