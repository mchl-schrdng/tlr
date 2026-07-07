import { test } from "node:test";
import assert from "node:assert/strict";
import type { StreamSet } from "@/lib/db";
import { trimp } from "@/lib/metrics/load";

// Steady 30 min at HR reserve 0.7 (rest 50, max 190 -> HR 148).
// Expected TRIMP = 30 * 0.7 * 0.64 * e^(1.92*0.7) ≈ 51.5.
test("trimp: steady 30 min at 70% HRR ~= 51", () => {
  const stream: StreamSet = {
    time: [0, 600, 1200, 1800],
    distance: [0, 3000, 6000, 9000],
    heartrate: [148, 148, 148, 148],
  };
  const value = trimp(stream, 50, 190);
  assert.ok(value !== null);
  assert.ok(value! > 45 && value! < 58, `trimp ${value}`);
});

test("trimp: harder effort yields more load than easier for equal duration", () => {
  const base = { time: [0, 1800], distance: [0, 6000] };
  const easy = trimp({ ...base, heartrate: [120, 120] }, 50, 190)!;
  const hard = trimp({ ...base, heartrate: [175, 175] }, 50, 190)!;
  assert.ok(hard > easy, `hard ${hard} should exceed easy ${easy}`);
});

test("trimp: no heart-rate stream -> null", () => {
  const stream: StreamSet = { time: [0, 600], distance: [0, 3000] };
  assert.equal(trimp(stream, 50, 190), null);
});

test("trimp: HR at or below rest contributes zero", () => {
  const stream: StreamSet = { time: [0, 600], distance: [0, 3000], heartrate: [45, 48] };
  assert.equal(trimp(stream, 50, 190), 0);
});
