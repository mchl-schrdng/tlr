import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSplits, computeHrZones, computeDecoupling, toSegments } from "@/lib/metrics/perRun";
import type { StreamSet } from "@/lib/db";

// Build a synthetic run: constant 3 m/s (5:33/km) for 2 km, constant HR 150.
function steadyRun(distanceM: number, speed: number, hr: number | null): StreamSet {
  const n = Math.ceil(distanceM / speed); // one sample per second; last sample clamps to distanceM
  const time: number[] = [];
  const distance: number[] = [];
  const heartrate: number[] = [];
  for (let i = 0; i <= n; i++) {
    time.push(i);
    distance.push(Math.min(i * speed, distanceM));
    if (hr != null) heartrate.push(hr);
  }
  const s: StreamSet = { time, distance };
  if (hr != null) s.heartrate = heartrate;
  return s;
}

test("computeSplits: steady 2km at 3 m/s -> ~333s/km", () => {
  const splits = computeSplits(steadyRun(2000, 3, 150));
  assert.equal(splits.length, 2);
  for (const sp of splits) {
    assert.ok(Math.abs(sp.paceSecPerKm - 1000 / 3) < 2, `pace ${sp.paceSecPerKm}`);
    assert.ok(Math.abs((sp.avgHr ?? 0) - 150) < 0.01);
  }
});

test("computeSplits: distances sum to total", () => {
  const splits = computeSplits(steadyRun(2500, 3, null));
  const total = splits.reduce((s, x) => s + x.distance, 0);
  assert.ok(Math.abs(total - 2500) < 1, `total ${total}`);
  assert.equal(splits[splits.length - 1].avgHr, null); // no HR stream
});

test("computeHrZones: constant 150bpm (HR_MAX 190 -> 0.79) lands in Z3", () => {
  const zones = computeHrZones(steadyRun(1000, 3, 150), 190);
  assert.ok(zones);
  const total = zones!.reduce((s, z) => s + z.seconds, 0);
  // 150/190 = 0.789 -> zone index 2 (Z3, bound 0.7)
  assert.ok(zones![2].seconds > 0.9 * total, "most time in Z3");
});

test("computeHrZones: no HR -> null", () => {
  assert.equal(computeHrZones(steadyRun(1000, 3, null)), null);
});

test("computeDecoupling: steady effort -> near 0%", () => {
  const d = computeDecoupling(steadyRun(4000, 3, 150));
  assert.ok(d);
  assert.ok(Math.abs(d!.percent) < 1, `decoupling ${d!.percent}`);
});

test("computeDecoupling: HR drift up in 2nd half -> positive %", () => {
  // First half HR 145, second half HR 165, same speed => efficiency drops.
  const speed = 3;
  const total = 4000;
  const n = Math.round(total / speed);
  const time: number[] = [];
  const distance: number[] = [];
  const heartrate: number[] = [];
  for (let i = 0; i <= n; i++) {
    time.push(i);
    distance.push(Math.min(i * speed, total));
    heartrate.push(i < n / 2 ? 145 : 165);
  }
  const d = computeDecoupling({ time, distance, heartrate });
  assert.ok(d);
  assert.ok(d!.percent > 8, `expected >8%, got ${d!.percent}`);
});

test("toSegments: empty/short streams -> []", () => {
  assert.deepEqual(toSegments({ time: [0], distance: [0] }), []);
  assert.deepEqual(toSegments({}), []);
});
