import { test } from "node:test";
import assert from "node:assert/strict";
import type { ActivityRow, StreamSet } from "@/lib/db";
import {
  assessRunQuality,
  pauseRatio,
  qualitySummary,
  rawSurface,
  surfaceSplitSummary,
} from "@/lib/metrics/quality";

function run(partial: Partial<ActivityRow>): ActivityRow {
  return {
    id: 1,
    name: "Run",
    start_date: "2026-07-01T07:00:00Z",
    type: "Run",
    distance: 5000,
    moving_time: 1500,
    elapsed_time: 1500,
    avg_hr: 150,
    max_hr: 170,
    elevation_gain: 20,
    avg_cadence: 172,
    avg_speed: 3.333,
    suffer_score: null,
    ...partial,
  };
}

function stream(partial: Partial<StreamSet> = {}): StreamSet {
  return {
    time: [0, 500, 1000, 1500],
    distance: [0, 1667, 3334, 5000],
    heartrate: [140, 150, 155, 160],
    cadence: [170, 172, 174, 172],
    ...partial,
  };
}

test("pauseRatio: returns stopped time divided by elapsed time", () => {
  assert.equal(pauseRatio(run({ moving_time: 800, elapsed_time: 1000 })), 0.2);
  assert.equal(pauseRatio(run({ moving_time: 1000, elapsed_time: 0 })), null);
  assert.equal(pauseRatio(run({ moving_time: 1100, elapsed_time: 1000 })), 0);
});

test("assessRunQuality: accepts a plausible complete run for performance trends", () => {
  const quality = assessRunQuality(run({}), stream());
  assert.equal(quality.validPerformance, true);
  assert.equal(quality.score, 100);
  assert.deepEqual(quality.reasons, []);
});

test("assessRunQuality: rejects paused, tiny and stream-mismatched runs", () => {
  const quality = assessRunQuality(
    run({ distance: 250, moving_time: 40, elapsed_time: 800, avg_speed: 0.4 }),
    stream({ distance: [0, 2500] }),
  );
  assert.equal(quality.validPerformance, false);
  assert.equal(quality.flags.tooShort, true);
  assert.equal(quality.flags.tooPaused, true);
  assert.equal(quality.flags.impossiblePace, true);
  assert.equal(quality.flags.distanceMismatch, true);
  assert.ok(quality.score < 50);
});

test("qualitySummary: counts eligible runs and data-quality failure modes", () => {
  const runs = [
    run({ id: 1 }),
    run({ id: 2, moving_time: 1, elapsed_time: 183, distance: 3, avg_speed: 0.1 }),
    run({ id: 3, avg_hr: null }),
  ];
  const streams = new Map<number, StreamSet | null>([
    [1, stream()],
    [2, stream({ distance: [0, 3] })],
    [3, null],
  ]);
  const summary = qualitySummary(runs, (id) => streams.get(id) ?? null);
  assert.equal(summary.total, 3);
  assert.equal(summary.performanceEligible, 1);
  assert.equal(summary.excluded, 2);
  assert.equal(summary.pauseOutliers, 1);
  assert.equal(summary.missingDistanceStream, 1);
  assert.equal(summary.missingHr, 1);
});

test("rawSurface: maps Strava trainer flag to surface", () => {
  assert.equal(rawSurface({ trainer: true }), "indoor");
  assert.equal(rawSurface({ trainer: false }), "outdoor");
  assert.equal(rawSurface({}), "unknown");
});

test("surfaceSplitSummary: separates treadmill and outdoor metrics", () => {
  const runs = [
    run({ id: 1, distance: 5000, moving_time: 1500, elevation_gain: 0, avg_hr: 140 }),
    run({ id: 2, distance: 10000, moving_time: 3600, elevation_gain: 120, avg_hr: 160 }),
  ];
  const raw = new Map<number, unknown>([
    [1, { trainer: true }],
    [2, { trainer: false }],
  ]);
  const split = surfaceSplitSummary(runs, raw);
  const indoor = split.find((s) => s.surface === "indoor");
  const outdoor = split.find((s) => s.surface === "outdoor");
  assert.equal(indoor?.runs, 1);
  assert.equal(indoor?.km, 5);
  assert.equal(indoor?.avgPaceSecPerKm, 300);
  assert.equal(outdoor?.runs, 1);
  assert.equal(outdoor?.elevationM, 120);
  assert.equal(outdoor?.avgHr, 160);
});
