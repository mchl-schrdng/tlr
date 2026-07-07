import { test } from "node:test";
import assert from "node:assert/strict";
import type { ActivityRow, StreamSet } from "@/lib/db";
import {
  consistencySummary,
  dailyLoadMatrix,
  fitnessFatigueTrend,
  hardDayPattern,
  longTermPaceHrProgression,
  paceHrPoints,
  qualifiedDecouplingTrend,
  weeklyLongRunTrend,
  weeklyZoneDistribution,
} from "@/lib/metrics/dashboard";

function run(partial: Partial<ActivityRow>): ActivityRow {
  return {
    id: 1,
    name: "r",
    start_date: "2026-06-01T07:00:00Z",
    type: "Run",
    distance: 10000,
    moving_time: 3000,
    elapsed_time: 3000,
    avg_hr: 150,
    max_hr: 170,
    elevation_gain: 50,
    avg_cadence: 170,
    avg_speed: 3.3,
    suffer_score: null,
    ...partial,
  };
}

function steadyStream(hr: number): StreamSet {
  const time = [0, 300, 600, 900];
  const distance = [0, 1000, 2000, 3000];
  const heartrate = [hr, hr, hr, hr];
  return { time, distance, heartrate };
}

function longSteadyStream(hrA = 140, hrB = 145): StreamSet {
  const time = [0, 900, 1800, 2700, 3600];
  const distance = [0, 2500, 5000, 7500, 10000];
  const heartrate = [hrA, hrA, hrA, hrB, hrB];
  return { time, distance, heartrate };
}

test("fitnessFatigueTrend: returns requested window with fatigue reacting faster", () => {
  const now = new Date("2026-07-01T12:00:00Z");
  const acts: ActivityRow[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getTime() - i * 86400_000);
    acts.push(run({ id: i, start_date: d.toISOString(), suffer_score: i < 3 ? 120 : 20 }));
  }
  const trend = fitnessFatigueTrend(acts, 14, now);
  assert.equal(trend.length, 14);
  const last = trend[trend.length - 1];
  assert.ok(last.fatigue > last.fitness, `fatigue ${last.fatigue}, fitness ${last.fitness}`);
  assert.ok(last.form < 0, `form ${last.form}`);
});

test("weeklyZoneDistribution: normalizes HR zones per week", () => {
  const now = new Date("2026-07-04T12:00:00Z");
  const acts = [
    run({ id: 1, start_date: "2026-07-01T07:00:00Z" }),
    run({ id: 2, start_date: "2026-07-02T07:00:00Z" }),
  ];
  const streams = new Map<number, StreamSet>([
    [1, steadyStream(120)],
    [2, steadyStream(175)],
  ]);
  const zones = weeklyZoneDistribution(acts, (id) => streams.get(id) ?? null, 1, now, 190);
  assert.equal(zones.length, 1);
  assert.ok(zones[0].z2 > 40, `z2 ${zones[0].z2}`);
  assert.ok(zones[0].z5 > 40, `z5 ${zones[0].z5}`);
  assert.ok(Math.abs(zones[0].z1 + zones[0].z2 + zones[0].z3 + zones[0].z4 + zones[0].z5 - 100) < 0.2);
});

test("paceHrPoints: filters impossible run pace outliers", () => {
  const points = paceHrPoints([
    run({ id: 1, avg_speed: 3.2, avg_hr: 150 }),
    run({ id: 2, avg_speed: 0.12, avg_hr: 150 }),
    run({ id: 3, avg_speed: 4, avg_hr: 70 }),
  ]);
  assert.equal(points.length, 1);
  assert.equal(points[0].id, 1);
});

test("consistencySummary: counts run days and long-run share over 28 days", () => {
  const now = new Date("2026-07-04T12:00:00Z");
  const acts = [
    run({ id: 1, start_date: "2026-07-04T07:00:00Z", distance: 12000 }),
    run({ id: 2, start_date: "2026-07-03T07:00:00Z", distance: 6000 }),
    run({ id: 3, start_date: "2026-07-01T07:00:00Z", distance: 6000 }),
    run({ id: 4, start_date: "2026-06-01T07:00:00Z", distance: 30000 }),
  ];
  const summary = consistencySummary(acts, now);
  assert.equal(summary.runDays28, 3);
  assert.equal(summary.currentStreak, 2);
  assert.equal(summary.longestStreak28, 2);
  assert.equal(summary.longRunKm28, 12);
  assert.equal(summary.longRunSharePct28, 50);
});

test("dailyLoadMatrix: TRIMP-weighted load when streams are provided", () => {
  const now = new Date("2026-07-04T12:00:00Z");
  const acts = [run({ id: 1, start_date: "2026-07-04T07:00:00Z", suffer_score: null })];
  const easy = dailyLoadMatrix(acts, 1, now, () => steadyStream(120));
  const hard = dailyLoadMatrix(acts, 1, now, () => steadyStream(175));
  assert.ok(hard[0].load > easy[0].load, `hard ${hard[0].load} vs easy ${easy[0].load}`);
  // No stream accessor -> falls back to the duration/effort proxy.
  const proxy = dailyLoadMatrix(acts, 1, now);
  assert.ok(proxy[0].load > 0);
});

test("weeklyLongRunTrend: tracks weekly volume and longest run share", () => {
  const now = new Date("2026-07-04T12:00:00Z");
  const trend = weeklyLongRunTrend(
    [
      run({ id: 1, start_date: "2026-07-01T07:00:00Z", distance: 12000 }),
      run({ id: 2, start_date: "2026-07-02T07:00:00Z", distance: 6000 }),
      run({ id: 3, start_date: "2026-06-24T07:00:00Z", distance: 5000 }),
    ],
    2,
    now,
  );
  assert.equal(trend.length, 2);
  assert.equal(trend[1].km, 18);
  assert.equal(trend[1].longKm, 12);
  assert.equal(trend[1].longSharePct, 67);
});

test("hardDayPattern: counts hard days and back-to-back spacing", () => {
  const now = new Date("2026-07-04T12:00:00Z");
  const acts = [
    run({ id: 1, start_date: "2026-07-04T07:00:00Z" }),
    run({ id: 2, start_date: "2026-07-03T07:00:00Z" }),
    run({ id: 3, start_date: "2026-07-01T07:00:00Z", suffer_score: 80, avg_hr: null }),
    run({ id: 4, start_date: "2026-06-20T07:00:00Z" }),
  ];
  const streams = new Map<number, StreamSet>([
    [1, steadyStream(175)],
    [2, steadyStream(174)],
    [3, steadyStream(120)],
  ]);
  const summary = hardDayPattern(acts, (id) => streams.get(id) ?? null, 7, now, 190);
  assert.equal(summary.totalRuns, 3);
  assert.equal(summary.hardRuns, 3);
  assert.equal(summary.hardDays, 3);
  assert.equal(summary.backToBackHardDays, 1);
  assert.equal(summary.daysSinceHard, 0);
});

test("qualifiedDecouplingTrend: keeps only long steady low-pause runs", () => {
  const acts = [
    run({ id: 1, start_date: "2026-07-04T07:00:00Z", distance: 10000, moving_time: 3600, elapsed_time: 3700 }),
    run({ id: 2, start_date: "2026-07-03T07:00:00Z", distance: 9000, moving_time: 3600, elapsed_time: 5000 }),
    run({ id: 3, start_date: "2026-07-02T07:00:00Z", distance: 3000, moving_time: 1000, elapsed_time: 1000 }),
  ];
  const streams = new Map<number, StreamSet>([
    [1, longSteadyStream()],
    [2, longSteadyStream()],
    [3, longSteadyStream()],
  ]);
  const trend = qualifiedDecouplingTrend(acts, (id) => streams.get(id) ?? null, 5);
  assert.equal(trend.length, 1);
  assert.equal(trend[0].id, 1);
  assert.equal(trend[0].km, 10);
});

test("longTermPaceHrProgression: groups all runs by quarter with weighted pace and HR", () => {
  const trend = longTermPaceHrProgression(
    [
      run({ id: 1, start_date: "2025-01-04T07:00:00Z", distance: 10000, moving_time: 3000, avg_hr: 150 }),
      run({ id: 2, start_date: "2025-03-04T07:00:00Z", distance: 5000, moving_time: 1800, avg_hr: 170 }),
      run({ id: 3, start_date: "2025-04-04T07:00:00Z", distance: 8000, moving_time: 3200, avg_hr: null }),
    ],
    "quarter",
  );
  assert.equal(trend.length, 2);
  assert.equal(trend[0].period, "2025 Q1");
  assert.equal(trend[0].count, 2);
  assert.equal(trend[0].km, 15);
  assert.equal(Math.round(trend[0].paceSecPerKm ?? 0), 320);
  assert.equal(Math.round(trend[0].avgHr ?? 0), 158);
  assert.equal(trend[1].period, "2025 Q2");
  assert.equal(trend[1].avgHr, null);
});

test("longTermPaceHrProgression: groups by year across the full history", () => {
  const trend = longTermPaceHrProgression(
    [
      run({ id: 1, start_date: "2024-12-20T07:00:00Z", distance: 10000, moving_time: 3600, avg_hr: 140 }),
      run({ id: 2, start_date: "2025-01-04T07:00:00Z", distance: 10000, moving_time: 3000, avg_hr: 150 }),
      run({ id: 3, start_date: "2025-07-04T07:00:00Z", distance: 5000, moving_time: 1800, avg_hr: 160 }),
    ],
    "year",
  );
  assert.deepEqual(trend.map((p) => p.period), ["2024", "2025"]);
  assert.equal(trend[0].km, 10);
  assert.equal(trend[1].km, 15);
  assert.equal(Math.round(trend[1].paceSecPerKm ?? 0), 320);
});
