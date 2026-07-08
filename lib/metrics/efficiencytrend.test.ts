import { test } from "node:test";
import assert from "node:assert/strict";
import { efficiencyTrajectory } from "@/lib/metrics/efficiencytrend";
import type { ActivityRow } from "@/lib/db";

const NOW = new Date("2026-07-08T08:00:00Z");
const DAY = 86400_000;

// A run `daysAgo` before NOW with the given aerobic signals. avg_speed in m/s,
// avg_hr in bpm — the only fields efficiencyTrajectory reads.
function run(id: number, daysAgo: number, avgSpeed: number, avgHr: number): ActivityRow {
  return {
    id,
    name: `run-${id}`,
    start_date: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
    type: "Run",
    distance: 10000,
    moving_time: 3000,
    elapsed_time: 3000,
    avg_hr: avgHr,
    max_hr: avgHr + 15,
    elevation_gain: 20,
    avg_cadence: 168,
    avg_speed: avgSpeed,
    suffer_score: 40,
  };
}

// Baseline window is (NOW-84d, NOW-42d]; recent window is (NOW-42d, NOW].
const recentDay = 10;
const baselineDay = 60;

test("efficiencyTrajectory: faster pace at the same HR reads as improving", () => {
  const acts: ActivityRow[] = [
    // Baseline: EF = 3.0/140*1000 = 21.43
    run(1, baselineDay, 3.0, 140),
    run(2, baselineDay + 3, 3.0, 140),
    run(3, baselineDay + 6, 3.0, 140),
    // Recent: EF = 3.2/140*1000 = 22.86 (~6.7% higher)
    run(4, recentDay, 3.2, 140),
    run(5, recentDay + 3, 3.2, 140),
    run(6, recentDay + 6, 3.2, 140),
  ];

  const traj = efficiencyTrajectory(acts, { now: NOW });
  assert.ok(traj !== null);
  assert.equal(traj.direction, "improving");
  assert.ok(traj.deltaPct > 5 && traj.deltaPct < 8, `deltaPct ${traj.deltaPct}`);
  assert.equal(traj.refHr, 140);
  // At 140 bpm, baseline implies 1000/3.0=333.3 s/km, recent 1000/3.2=312.5 s/km.
  assert.ok(Math.abs(traj.baselinePaceSecPerKm - 333.33) < 0.5, `base ${traj.baselinePaceSecPerKm}`);
  assert.ok(Math.abs(traj.recentPaceSecPerKm - 312.5) < 0.5, `recent ${traj.recentPaceSecPerKm}`);
  // Positive paceDelta = faster now.
  assert.ok(Math.abs(traj.paceDeltaSecPerKm - 20.83) < 0.5, `delta ${traj.paceDeltaSecPerKm}`);
  assert.equal(traj.recentSamples, 3);
  assert.equal(traj.baselineSamples, 3);
});

test("efficiencyTrajectory: slower pace at the same HR reads as declining", () => {
  const acts: ActivityRow[] = [
    run(1, baselineDay, 3.2, 140),
    run(2, baselineDay + 3, 3.2, 140),
    run(3, baselineDay + 6, 3.2, 140),
    run(4, recentDay, 3.0, 140),
    run(5, recentDay + 3, 3.0, 140),
    run(6, recentDay + 6, 3.0, 140),
  ];
  const traj = efficiencyTrajectory(acts, { now: NOW });
  assert.ok(traj !== null);
  assert.equal(traj.direction, "declining");
  assert.ok(traj.deltaPct < 0, `deltaPct ${traj.deltaPct}`);
  assert.ok(traj.paceDeltaSecPerKm < 0, `paceDelta ${traj.paceDeltaSecPerKm}`);
});

test("efficiencyTrajectory: change within the noise band reads as flat", () => {
  const acts: ActivityRow[] = [
    run(1, baselineDay, 3.0, 140),
    run(2, baselineDay + 3, 3.0, 140),
    run(3, baselineDay + 6, 3.0, 140),
    // ~1% faster — below the meaningful threshold.
    run(4, recentDay, 3.03, 140),
    run(5, recentDay + 3, 3.03, 140),
    run(6, recentDay + 6, 3.03, 140),
  ];
  const traj = efficiencyTrajectory(acts, { now: NOW });
  assert.ok(traj !== null);
  assert.equal(traj.direction, "flat");
});

test("efficiencyTrajectory: too few eligible runs in a window -> null", () => {
  const acts: ActivityRow[] = [
    run(1, baselineDay, 3.0, 140),
    run(2, baselineDay + 3, 3.0, 140),
    run(3, baselineDay + 6, 3.0, 140),
    // Only two recent runs — below the minimum sample count.
    run(4, recentDay, 3.2, 140),
    run(5, recentDay + 3, 3.2, 140),
  ];
  assert.equal(efficiencyTrajectory(acts, { now: NOW }), null);
});

test("efficiencyTrajectory: excludes non-aerobic runs, missing signals and out-of-window runs", () => {
  const acts: ActivityRow[] = [
    // Three clean aerobic baseline runs.
    run(1, baselineDay, 3.0, 140),
    run(2, baselineDay + 3, 3.0, 140),
    run(3, baselineDay + 6, 3.0, 140),
    // Three clean aerobic recent runs.
    run(4, recentDay, 3.2, 140),
    run(5, recentDay + 3, 3.2, 140),
    run(6, recentDay + 6, 3.2, 140),
    // Noise that must be ignored:
    run(7, recentDay + 1, 4.5, 178), // HR above aerobic band
    { ...run(8, recentDay + 2, 3.2, 140), avg_hr: null }, // missing HR
    { ...run(9, recentDay + 2, 3.2, 140), avg_speed: null }, // missing speed
    run(10, 100, 2.0, 140), // older than the baseline window
  ];
  const traj = efficiencyTrajectory(acts, { now: NOW });
  assert.ok(traj !== null);
  assert.equal(traj.recentSamples, 3);
  assert.equal(traj.baselineSamples, 3);
  assert.equal(traj.direction, "improving");
});

test("efficiencyTrajectory: excludes hilly/trail runs so terrain can't fake a decline", () => {
  const acts: ActivityRow[] = [
    run(1, baselineDay, 3.0, 140),
    run(2, baselineDay + 3, 3.0, 140),
    run(3, baselineDay + 6, 3.0, 140),
    // Recent runs are only "slow" because they climb 500 m over 10 km (50 m/km) —
    // trail effort, not lost fitness. They must be excluded, leaving too few
    // recent flat runs to judge -> null.
    { ...run(4, recentDay, 2.4, 140), elevation_gain: 500 },
    { ...run(5, recentDay + 3, 2.4, 140), elevation_gain: 500 },
    { ...run(6, recentDay + 6, 2.4, 140), elevation_gain: 500 },
  ];
  assert.equal(efficiencyTrajectory(acts, { now: NOW }), null);
});

test("efficiencyTrajectory: excludes indoor/treadmill runs via rawById", () => {
  const acts: ActivityRow[] = [
    run(1, baselineDay, 3.0, 140),
    run(2, baselineDay + 3, 3.0, 140),
    run(3, baselineDay + 6, 3.0, 140),
    run(4, recentDay, 3.2, 140),
    run(5, recentDay + 3, 3.2, 140),
    run(6, recentDay + 6, 3.2, 140),
    // Two treadmill runs (miscalibrated pace) that would otherwise drag the trend.
    run(7, recentDay + 1, 2.5, 140),
    run(8, recentDay + 2, 2.5, 140),
  ];
  const rawById = new Map<number, unknown>([
    [7, { trainer: true }],
    [8, { trainer: true }],
  ]);
  const traj = efficiencyTrajectory(acts, { now: NOW, rawById });
  assert.ok(traj !== null);
  assert.equal(traj.recentSamples, 3); // 7 and 8 excluded as indoor
  assert.equal(traj.direction, "improving");
});

test("efficiencyTrajectory: excludes runs with unknown elevation (can't confirm flat)", () => {
  const acts: ActivityRow[] = [
    run(1, baselineDay, 3.0, 140),
    run(2, baselineDay + 3, 3.0, 140),
    run(3, baselineDay + 6, 3.0, 140),
    { ...run(4, recentDay, 3.2, 140), elevation_gain: null },
    { ...run(5, recentDay + 3, 3.2, 140), elevation_gain: null },
    { ...run(6, recentDay + 6, 3.2, 140), elevation_gain: null },
  ];
  assert.equal(efficiencyTrajectory(acts, { now: NOW }), null);
});

test("efficiencyTrajectory: no activities -> null", () => {
  assert.equal(efficiencyTrajectory([], { now: NOW }), null);
});
