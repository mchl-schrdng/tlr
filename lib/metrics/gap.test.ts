import { test } from "node:test";
import assert from "node:assert/strict";
import { gapFactor, gradeAdjustedSpeed, runningPowerAvg, gradeSeries } from "@/lib/metrics/gap";
import type { StreamSet } from "@/lib/db";

// Synthetic flat run: constant speed, constant altitude, one sample per second.
function flatRun(distanceM: number, speed: number): StreamSet {
  const n = Math.round(distanceM / speed);
  const time: number[] = [];
  const distance: number[] = [];
  const altitude: number[] = [];
  for (let i = 0; i <= n; i++) {
    time.push(i);
    distance.push(i * speed);
    altitude.push(100); // flat
  }
  return { time, distance, altitude };
}

// Synthetic uphill run: constant speed, constant grade the whole way.
function uphillRun(distanceM: number, speed: number, grade: number): StreamSet {
  const n = Math.round(distanceM / speed);
  const time: number[] = [];
  const distance: number[] = [];
  const altitude: number[] = [];
  for (let i = 0; i <= n; i++) {
    const d = i * speed;
    time.push(i);
    distance.push(d);
    altitude.push(d * grade);
  }
  return { time, distance, altitude };
}

test("gapFactor: flat grade is the baseline (1)", () => {
  assert.equal(gapFactor(0), 1);
});

test("gapFactor: uphill costs more than flat", () => {
  assert.ok(gapFactor(0.1) > 1, `gapFactor(0.1) = ${gapFactor(0.1)}`);
});

test("gradeAdjustedSpeed: flat stream ~= raw average speed (within a few %)", () => {
  const s = flatRun(3000, 3);
  const gas = gradeAdjustedSpeed(s);
  assert.ok(gas != null);
  const rawAvg = 3000 / 1000; // total distance / total time
  assert.ok(Math.abs(gas! - rawAvg) / rawAvg < 0.03, `gas ${gas} vs raw ${rawAvg}`);
});

test("gradeAdjustedSpeed: uphill stream is faster (flat-equivalent) than raw avg speed", () => {
  const s = uphillRun(3000, 3, 0.05); // 5% grade throughout
  const gas = gradeAdjustedSpeed(s);
  const rawAvg = 3000 / 1000;
  assert.ok(gas != null && gas! > rawAvg, `gas ${gas} raw ${rawAvg}`);
});

test("runningPowerAvg: uphill 75kg runner lands in a broad sane band", () => {
  const s = uphillRun(3000, 3, 0.05);
  const power = runningPowerAvg(s, 75);
  assert.ok(power != null);
  assert.ok(power! > 200 && power! < 2000, `power ${power}`);
});

test("runningPowerAvg: flat 75kg runner at ~3 m/s is in the same broad band", () => {
  const s = flatRun(3000, 3);
  const power = runningPowerAvg(s, 75);
  assert.ok(power != null);
  assert.ok(power! > 200 && power! < 2000, `power ${power}`);
});

test("gradeAdjustedSpeed: empty stream -> null", () => {
  assert.equal(gradeAdjustedSpeed({}), null);
});

test("runningPowerAvg: empty stream -> null", () => {
  assert.equal(runningPowerAvg({}, 70), null);
});

test("gradeSeries: empty stream -> []", () => {
  assert.deepEqual(gradeSeries({}), []);
});

test("gradeSeries: 0 when Δdistance ≈ 0, clamps extreme grade otherwise", () => {
  const s: StreamSet = { distance: [0, 0, 10], altitude: [0, 0, 100] };
  const grades = gradeSeries(s);
  assert.equal(grades.length, 2);
  assert.equal(grades[0], 0); // Δdistance ≈ 0
  assert.equal(grades[1], 0.45); // 100/10 = 10, clamped to max
});
