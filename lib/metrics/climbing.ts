import type { StreamSet } from "@/lib/db";

// Climbing analysis from the altitude stream — data most apps leave on the floor.
// VAM (velocità ascensionale media) is vertical metres climbed per hour, the
// standard measure of climbing strength. We also separate uphill vs flat running
// speed so hilly and flat efforts can be compared honestly.

export type Climbing = {
  totalAscentM: number;
  totalDescentM: number;
  vamMPerH: number | null; // vertical metres / hour of climbing time
  uphillSpeed: number | null; // m/s on grades > +3%
  flatSpeed: number | null; // m/s on |grade| < 1%
};

// Per-run climbing metrics, or null without altitude+distance+time.
export function climbingMetrics(s: StreamSet): Climbing | null {
  const time = s.time;
  const dist = s.distance;
  const alt = s.altitude;
  if (!time || !dist || !alt || time.length < 2) return null;

  let totalAscentM = 0;
  let totalDescentM = 0;
  let climbTime = 0;
  let upDist = 0;
  let upTime = 0;
  let flatDist = 0;
  let flatTime = 0;

  const n = Math.min(time.length, dist.length, alt.length);
  for (let i = 1; i < n; i++) {
    const dt = time[i] - time[i - 1];
    const dd = dist[i] - dist[i - 1];
    const da = alt[i] - alt[i - 1];
    if (dt <= 0 || dd < 0) continue;
    if (da > 0) {
      totalAscentM += da;
      climbTime += dt;
    } else {
      totalDescentM += -da;
    }
    const grade = dd > 0 ? da / dd : 0;
    if (grade > 0.03) {
      upDist += dd;
      upTime += dt;
    } else if (Math.abs(grade) < 0.01) {
      flatDist += dd;
      flatTime += dt;
    }
  }

  return {
    totalAscentM,
    totalDescentM,
    vamMPerH: climbTime > 0 ? (totalAscentM / climbTime) * 3600 : null,
    uphillSpeed: upTime > 0 ? upDist / upTime : null,
    flatSpeed: flatTime > 0 ? flatDist / flatTime : null,
  };
}
