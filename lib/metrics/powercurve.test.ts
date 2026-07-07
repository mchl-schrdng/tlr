import { test } from "node:test";
import assert from "node:assert/strict";
import type { StreamSet } from "@/lib/db";
import { powerCurve } from "@/lib/metrics/powercurve";

// Constant-speed flat run: power ≈ weight * 3.6 * speed (Cr(0)=3.6), constant.
function flatRun(speed: number, durationSec: number): StreamSet {
  const time: number[] = [], distance: number[] = [], altitude: number[] = [];
  for (let i = 0; i <= durationSec; i++) {
    time.push(i);
    distance.push(i * speed);
    altitude.push(100);
  }
  return { time, distance, altitude };
}

test("powerCurve on a steady flat run ≈ weight*3.6*speed at every duration", () => {
  const w = 70, speed = 3;
  const curve = powerCurve([flatRun(speed, 1400)], w, [5, 60, 600, 1200]);
  assert.equal(curve.length, 4);
  const expected = w * 3.6 * speed; // ≈ 756 W
  for (const p of curve) assert.ok(Math.abs(p.watts - expected) < expected * 0.08, `${p.sec}s → ${p.watts}`);
});

test("powerCurve short durations >= long durations (mean-max is monotonic)", () => {
  // A run with a fast surge in the middle → short-window power should exceed long-window.
  const time: number[] = [], distance: number[] = [], altitude: number[] = [];
  let d = 0;
  for (let i = 0; i <= 1300; i++) {
    const speed = i >= 600 && i < 660 ? 6 : 2.5; // 1-min surge
    d += speed;
    time.push(i); distance.push(d); altitude.push(100);
  }
  const curve = powerCurve([{ time, distance, altitude }], 70, [30, 1200]);
  const short = curve.find((p) => p.sec === 30)!;
  const long = curve.find((p) => p.sec === 1200)!;
  assert.ok(short.watts > long.watts, `30s ${short.watts} vs 1200s ${long.watts}`);
});

test("powerCurve omits durations longer than any stream", () => {
  const curve = powerCurve([flatRun(3, 120)], 70, [60, 1200]);
  assert.ok(curve.some((p) => p.sec === 60));
  assert.ok(!curve.some((p) => p.sec === 1200));
});

test("powerCurve is empty with no usable streams", () => {
  assert.deepEqual(powerCurve([{ time: [0], distance: [0] }], 70), []);
});
