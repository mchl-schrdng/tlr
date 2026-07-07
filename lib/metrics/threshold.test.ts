import { test } from "node:test";
import assert from "node:assert/strict";
import type { ActivityRow, StreamSet } from "@/lib/db";
import {
  observedMaxHr,
  bestSustainedHr,
  estimateLthr,
  hrZonesFromLthr,
  thresholdProfile,
} from "@/lib/metrics/threshold";

function run(partial: Partial<ActivityRow>): ActivityRow {
  return {
    id: 1, name: "r", start_date: "2026-07-01T07:00:00Z", type: "Run",
    distance: 10000, moving_time: 3000, elapsed_time: 3000,
    avg_hr: 150, max_hr: 170, elevation_gain: 0, avg_cadence: 170,
    avg_speed: 3.3, suffer_score: null, ...partial,
  };
}

// Constant-HR stream of `durationSec` at `hr` bpm, 1 Hz.
function hrStream(hr: number, durationSec: number): StreamSet {
  const time: number[] = [];
  const heartrate: number[] = [];
  const distance: number[] = [];
  for (let i = 0; i <= durationSec; i++) {
    time.push(i);
    heartrate.push(hr);
    distance.push(i * 3);
  }
  return { time, heartrate, distance };
}

test("observedMaxHr returns the highest recorded max_hr", () => {
  const acts = [run({ max_hr: 168 }), run({ max_hr: 182 }), run({ max_hr: null })];
  assert.equal(observedMaxHr(acts), 182);
});

test("observedMaxHr is null when no HR recorded", () => {
  assert.equal(observedMaxHr([run({ max_hr: null })]), null);
});

test("bestSustainedHr returns the held HR for a long-enough steady stream", () => {
  const s = hrStream(165, 1400); // 23+ min at 165
  const v = bestSustainedHr(s, 1200);
  assert.ok(v !== null);
  assert.ok(Math.abs(v! - 165) < 1, `got ${v}`);
});

test("bestSustainedHr is null when the stream is shorter than the window", () => {
  assert.equal(bestSustainedHr(hrStream(160, 300), 1200), null);
});

test("estimateLthr picks the hardest sustained effort across streams", () => {
  const easy = hrStream(140, 1400);
  const hard = hrStream(172, 1400);
  const v = estimateLthr([easy, hard], 1200);
  assert.ok(v !== null);
  assert.ok(Math.abs(v! - 172) < 1, `got ${v}`);
});

test("hrZonesFromLthr yields 5 ordered, non-overlapping zones anchored at LTHR", () => {
  const z = hrZonesFromLthr(170);
  assert.equal(z.length, 5);
  // Z4 upper bound is LTHR itself; Z5 opens above it.
  assert.equal(z[3].max, 170);
  assert.equal(z[4].min, 170);
  assert.equal(z[4].max, null);
  // Monotonic non-overlap.
  for (let i = 1; i < z.length; i++) {
    assert.equal(z[i].min, z[i - 1].max);
  }
});

test("thresholdProfile combines anchors and zones, or reports none", () => {
  const acts = [run({ max_hr: 185 })];
  const withHr = thresholdProfile(acts, [hrStream(170, 1400)]);
  assert.equal(withHr.source, "estimated");
  assert.equal(withHr.maxHr, 185);
  assert.ok(withHr.zones && withHr.zones.length === 5);

  const noHr = thresholdProfile(acts, [hrStream(170, 300)]); // too short → no LTHR
  assert.equal(noHr.source, "none");
  assert.equal(noHr.zones, null);
});
