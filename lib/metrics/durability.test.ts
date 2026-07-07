import { test } from "node:test";
import assert from "node:assert/strict";
import type { ActivityRow, StreamSet } from "@/lib/db";
import { runFade, durabilitySummary } from "@/lib/metrics/durability";

// Build a run stream where speed is constant but HR rises linearly from hr0→hr1.
// Rising HR at constant speed = efficiency fades = positive fadePct.
function driftStream(hr0: number, hr1: number, durationSec = 3600, speed = 3): StreamSet {
  const time: number[] = [], distance: number[] = [], heartrate: number[] = [];
  for (let i = 0; i <= durationSec; i += 10) {
    time.push(i);
    distance.push(i * speed);
    heartrate.push(Math.round(hr0 + (hr1 - hr0) * (i / durationSec)));
  }
  return { time, distance, heartrate };
}

function run(partial: Partial<ActivityRow>): ActivityRow {
  return {
    id: 1, name: "r", start_date: "2026-07-01T07:00:00Z", type: "Run",
    distance: 12000, moving_time: 3600, elapsed_time: 3600, avg_hr: 150,
    max_hr: 170, elevation_gain: 0, avg_cadence: 170, avg_speed: 3,
    suffer_score: null, ...partial,
  };
}

test("runFade is ~0 for a perfectly steady run", () => {
  const f = runFade(driftStream(150, 150));
  assert.ok(f);
  assert.ok(Math.abs(f!.fadePct) < 1, `fade ${f!.fadePct}`);
});

test("runFade is positive when HR drifts up at constant speed", () => {
  const f = runFade(driftStream(140, 170));
  assert.ok(f);
  assert.ok(f!.fadePct > 5, `fade ${f!.fadePct}`);
  assert.ok(f!.earlyEf > f!.lateEf);
});

test("runFade is null without heart rate or when too short", () => {
  assert.equal(runFade({ time: [0, 1], distance: [0, 3] }), null);
});

test("durabilitySummary rates a steady long run as excellent", () => {
  const d = durabilitySummary([run({ id: 1 })], () => driftStream(150, 150));
  assert.equal(d.runs, 1);
  assert.equal(d.rating, "excellent");
});

test("durabilitySummary skips runs shorter than the minimum", () => {
  const d = durabilitySummary([run({ id: 1, moving_time: 600 })], () => driftStream(150, 170));
  assert.equal(d.runs, 0);
  assert.equal(d.rating, "unknown");
  assert.equal(d.medianFadePct, null);
});

test("durabilitySummary rates a big late fade as poor", () => {
  const d = durabilitySummary([run({ id: 1 })], () => driftStream(130, 175));
  assert.equal(d.rating, "poor");
  assert.ok((d.medianFadePct ?? 0) >= 10);
});
