import { test } from "node:test";
import assert from "node:assert/strict";
import type { StreamSet } from "@/lib/db";
import { climbingMetrics } from "@/lib/metrics/climbing";

// Flat then a steady climb. 500 m flat at 3 m/s, then a climb gaining 100 m over
// 1000 m horizontal (10% grade) at 2 m/s.
function hillStream(): StreamSet {
  const time: number[] = [], distance: number[] = [], altitude: number[] = [];
  let t = 0, d = 0, a = 100;
  time.push(t); distance.push(d); altitude.push(a);
  // flat: 500 m at 3 m/s → 167 s
  for (let i = 0; i < 167; i++) { t += 1; d += 3; time.push(t); distance.push(d); altitude.push(a); }
  // climb: 1000 m horizontal at 2 m/s → 500 s, +100 m
  for (let i = 0; i < 500; i++) { t += 1; d += 2; a += 100 / 500; time.push(t); distance.push(d); altitude.push(a); }
  return { time, distance, altitude };
}

test("climbingMetrics sums ascent and computes a positive VAM", () => {
  const c = climbingMetrics(hillStream());
  assert.ok(c);
  assert.ok(Math.abs(c!.totalAscentM - 100) < 2, `ascent ${c!.totalAscentM}`);
  assert.ok(c!.vamMPerH! > 0);
  // 100 m climbed over 500 s → 720 m/h
  assert.ok(Math.abs(c!.vamMPerH! - 720) < 40, `vam ${c!.vamMPerH}`);
});

test("climbingMetrics separates uphill from flat speed", () => {
  const c = climbingMetrics(hillStream());
  assert.ok(c);
  assert.ok(c!.flatSpeed! > c!.uphillSpeed!, `flat ${c!.flatSpeed} up ${c!.uphillSpeed}`);
  assert.ok(Math.abs(c!.flatSpeed! - 3) < 0.3);
  assert.ok(Math.abs(c!.uphillSpeed! - 2) < 0.3);
});

test("climbingMetrics is null without an altitude stream", () => {
  assert.equal(climbingMetrics({ time: [0, 1], distance: [0, 3] }), null);
});
