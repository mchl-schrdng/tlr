import { test } from "node:test";
import assert from "node:assert/strict";
import { bestEffortSeconds, vo2maxTrend } from "@/lib/metrics/fitnesstrend";
import { estimateVdot } from "@/lib/metrics/vo2max";
import type { StreamSet, ActivityRow } from "@/lib/db";

// Constant-speed stream, one sample per second. `distanceM` is made well
// beyond any `targetM` used in these tests so the fastest window always
// falls inside the uniform-speed region (the very last sample is clamped to
// `distanceM` and would otherwise distort a window that overlaps the tail).
function steadyStream(distanceM: number, speedMs: number): StreamSet {
  const n = Math.ceil(distanceM / speedMs);
  const time: number[] = [];
  const distance: number[] = [];
  for (let i = 0; i <= n; i++) {
    time.push(i);
    distance.push(Math.min(i * speedMs, distanceM));
  }
  return { time, distance };
}

function activity(id: number, startDate: string, distance: number): ActivityRow {
  return {
    id,
    name: `run-${id}`,
    start_date: startDate,
    type: "Run",
    distance,
    moving_time: 0,
    elapsed_time: 0,
    avg_hr: null,
    max_hr: null,
    elevation_gain: null,
    avg_cadence: null,
    avg_speed: null,
    suffer_score: null,
  };
}

test("bestEffortSeconds: constant-speed stream -> targetM / speed", () => {
  const speed = 3.7; // deliberately non-round, to exercise interpolation
  const seconds = bestEffortSeconds(steadyStream(3000, speed), 1000);
  assert.ok(seconds !== null);
  assert.ok(Math.abs((seconds as number) - 1000 / speed) < 0.01, `seconds ${seconds}`);
});

test("bestEffortSeconds: stream shorter than targetM -> null", () => {
  assert.equal(bestEffortSeconds(steadyStream(500, 4), 1000), null);
});

test("bestEffortSeconds: missing distance/time -> null", () => {
  assert.equal(bestEffortSeconds({}, 1000), null);
  assert.equal(bestEffortSeconds({ time: [0, 1] }, 1000), null);
});

test("vo2maxTrend: skips activities with no stream, faster effort raises the latest point, trailing max never drops", () => {
  const speedSlow = 3; // 1000m in 333.3s
  const speedBest1 = 4; // 1000m in 250s - new best over speedSlow
  const speedMid = 3.5; // 1000m in 285.7s - slower than best1, should NOT lower the trend
  const speedBest2 = 5; // 1000m in 200s - new overall best

  const streams = new Map<number, StreamSet>([
    [1, steadyStream(3000, speedSlow)],
    [2, steadyStream(3000, speedBest1)],
    // id 3 intentionally has no stream
    [4, steadyStream(3000, speedMid)],
    [5, steadyStream(3000, speedBest2)],
  ]);
  const getStream = (id: number): StreamSet | null => streams.get(id) ?? null;

  const activities: ActivityRow[] = [
    activity(1, "2026-01-01T08:00:00Z", 3000),
    activity(2, "2026-01-11T08:00:00Z", 3000),
    activity(3, "2026-01-21T08:00:00Z", 3000), // no stream -> skipped
    activity(4, "2026-01-31T08:00:00Z", 3000), // slower than id2's best, still within 42d window
    activity(5, "2026-02-10T08:00:00Z", 3000), // new overall best
  ];

  const points = vo2maxTrend(activities, getStream, 1000, 42);

  // Activity 3 (no stream) produced no point.
  assert.equal(points.length, 4);
  assert.deepEqual(
    points.map((p) => p.date),
    ["2026-01-01", "2026-01-11", "2026-01-31", "2026-02-10"],
  );

  const vdotSlow = estimateVdot(1000, 1000 / speedSlow);
  const vdotBest1 = estimateVdot(1000, 1000 / speedBest1);
  const vdotBest2 = estimateVdot(1000, 1000 / speedBest2);

  // Point 1: only the slow effort exists so far.
  assert.ok(Math.abs(points[0].vo2max - vdotSlow) < 0.01);

  // Point 2: a faster run raises the trend's latest vo2max above the prior point.
  assert.ok(Math.abs(points[1].vo2max - vdotBest1) < 0.01);
  assert.ok(points[1].vo2max > points[0].vo2max);

  // Point 3 (activity 4, the mid-pace run 20 days after the best): the
  // trailing-max means the line does NOT drop just because this run itself
  // was slower than the standing best - it holds at the prior best.
  assert.ok(Math.abs(points[2].vo2max - vdotBest1) < 0.01);
  assert.ok(points[2].vo2max >= points[1].vo2max);

  // Point 4: a new overall best raises the line again, and it never dropped
  // on the way there.
  assert.ok(Math.abs(points[3].vo2max - vdotBest2) < 0.01);
  assert.ok(points[3].vo2max > points[2].vo2max);
});

test("vo2maxTrend: activity whose stream can't cover targetM is skipped", () => {
  const streams = new Map<number, StreamSet>([
    [1, steadyStream(3000, 4)],
    [2, steadyStream(500, 4)], // too short to cover 1000m
  ]);
  const getStream = (id: number): StreamSet | null => streams.get(id) ?? null;
  const activities: ActivityRow[] = [
    activity(1, "2026-01-01T08:00:00Z", 3000),
    activity(2, "2026-01-05T08:00:00Z", 500),
  ];
  const points = vo2maxTrend(activities, getStream, 1000, 42);
  assert.equal(points.length, 1);
  assert.equal(points[0].date, "2026-01-01");
});

test("vo2maxTrend: empty activities -> empty trend", () => {
  assert.deepEqual(vo2maxTrend([], () => null), []);
});
