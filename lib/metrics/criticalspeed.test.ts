import { test } from "node:test";
import assert from "node:assert/strict";
import type { StreamSet } from "@/lib/db";
import { meanMaxSpeed, criticalSpeed, paceZonesFromCS } from "@/lib/metrics/criticalspeed";

// Synthetic constant-speed stream: 1 sample every `stepSec`, distance = speed * t.
// Because speed never varies, ANY window (of any length, at any offset) covers
// exactly speed * duration metres, so best-effort results are fully predictable.
function constantSpeedStream(speed: number, durationSec: number, stepSec = 10): StreamSet {
  const time: number[] = [];
  const distance: number[] = [];
  for (let t = 0; t <= durationSec; t += stepSec) {
    time.push(t);
    distance.push(speed * t);
  }
  if (time[time.length - 1] !== durationSec) {
    time.push(durationSec);
    distance.push(speed * durationSec);
  }
  return { time, distance };
}

test("meanMaxSpeed: descending speed for increasing duration", () => {
  // Shorter efforts are faster, longer efforts are slower - a realistic profile.
  const streams: StreamSet[] = [
    constantSpeedStream(6.0, 60), // 1 min @ 6.0 m/s
    constantSpeedStream(5.0, 300), // 5 min @ 5.0 m/s
    constantSpeedStream(4.5, 600), // 10 min @ 4.5 m/s
    constantSpeedStream(4.0, 1800), // 30 min @ 4.0 m/s
  ];

  const mm = meanMaxSpeed(streams, [60, 300, 600, 1800]);

  assert.equal(mm.length, 4);
  assert.deepEqual(
    mm.map((p) => p.sec),
    [60, 300, 600, 1800],
  );
  // Each duration's best window is exactly the matching stream's full length.
  assert.ok(Math.abs(mm[0].speed - 6.0) < 1e-9);
  assert.ok(Math.abs(mm[1].speed - 5.0) < 1e-9);
  assert.ok(Math.abs(mm[2].speed - 4.5) < 1e-9);
  assert.ok(Math.abs(mm[3].speed - 4.0) < 1e-9);
  // Strictly descending as duration grows.
  for (let i = 1; i < mm.length; i++) {
    assert.ok(mm[i].speed < mm[i - 1].speed, `speed should decrease: ${JSON.stringify(mm)}`);
  }
});

test("meanMaxSpeed: picks the best speed across streams for a shared duration", () => {
  // Two streams both long enough for a 120s window; the faster one should win.
  const streams: StreamSet[] = [constantSpeedStream(3.0, 600), constantSpeedStream(5.0, 200)];
  const mm = meanMaxSpeed(streams, [120]);
  assert.equal(mm.length, 1);
  assert.ok(Math.abs(mm[0].speed - 5.0) < 1e-9);
});

test("meanMaxSpeed: omits a duration no stream is long enough for", () => {
  const streams: StreamSet[] = [constantSpeedStream(5.0, 100)];
  const mm = meanMaxSpeed(streams, [60, 3600]);
  assert.deepEqual(
    mm.map((p) => p.sec),
    [60],
  );
});

test("criticalSpeed: recovers a positive cs and finite dPrime from a clean speed/duration curve", () => {
  const durations = [120, 300, 600, 1200];
  const speeds = [6.0, 5.5, 5.0, 4.5]; // faster for shorter durations
  const streams: StreamSet[] = durations.map((d, i) => constantSpeedStream(speeds[i], d));

  const result = criticalSpeed(streams);
  assert.ok(result !== null);
  const { cs, dPrime } = result as { cs: number; dPrime: number };

  assert.ok(cs > 0, `cs should be positive, got ${cs}`);
  // CS is the asymptotic sustainable speed: for a curve that's faster at
  // shorter durations, it should sit at or below the slowest tested speed
  // and, sanity-wise, never exceed the fastest tested speed.
  assert.ok(cs <= Math.max(...speeds), `cs ${cs} should not exceed fastest tested speed`);
  assert.ok(cs > 0.5 * Math.min(...speeds), `cs ${cs} should be in the ballpark of tested speeds`);
  assert.ok(Number.isFinite(dPrime), `dPrime should be finite, got ${dPrime}`);
});

test("criticalSpeed: null when fewer than 2 durations are usable", () => {
  // Only long enough for the shortest default duration (120s).
  const streams: StreamSet[] = [constantSpeedStream(5.0, 150)];
  assert.equal(criticalSpeed(streams), null);
});

test("criticalSpeed: null for an empty stream set", () => {
  assert.equal(criticalSpeed([]), null);
});

test("paceZonesFromCS: 5 ordered, contiguous, non-overlapping zones", () => {
  const cs = 5.0;
  const zones = paceZonesFromCS(cs);

  assert.equal(zones.length, 5);
  assert.deepEqual(
    zones.map((z) => z.label),
    ["Easy", "Moderate", "Threshold", "Interval", "Rep"],
  );

  // Contiguous: each zone's floor is the previous zone's ceiling.
  for (let i = 1; i < zones.length; i++) {
    assert.equal(zones[i].minSpeed, zones[i - 1].maxSpeed);
  }
  // Strictly increasing bounds (non-overlapping, ordered), last zone open-ended.
  for (let i = 0; i < zones.length - 1; i++) {
    assert.ok(zones[i].minSpeed < zones[i].maxSpeed);
  }
  assert.equal(zones[zones.length - 1].maxSpeed, Infinity);

  // Threshold spans ~[0.9*cs, cs].
  const threshold = zones.find((z) => z.label === "Threshold")!;
  assert.ok(Math.abs(threshold.minSpeed - 0.9 * cs) < 1e-9);
  assert.ok(Math.abs(threshold.maxSpeed - cs) < 1e-9);
});
