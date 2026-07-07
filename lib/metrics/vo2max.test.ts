import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateVdot, predictTime, racePredictions } from "@/lib/metrics/vo2max";

test("estimateVdot: a 25:00 5k lands around VDOT 39-41", () => {
  const vdot = estimateVdot(5000, 25 * 60);
  assert.ok(vdot > 38 && vdot < 42, `vdot ${vdot}`);
});

test("estimateVdot: faster time yields higher VDOT", () => {
  assert.ok(estimateVdot(5000, 20 * 60) > estimateVdot(5000, 25 * 60));
});

test("predictTime: Riegel scales a 5k up to a slower per-km marathon", () => {
  const fiveK = 25 * 60;
  const marathon = predictTime(5000, fiveK, 42195);
  // Marathon pace must be slower than 5k pace (more seconds per km).
  assert.ok(marathon / 42.195 > fiveK / 5, "marathon pace should be slower than 5k pace");
  // A 25:00 5k predicts roughly a 4h-ish marathon (3h30–4h30 sanity band).
  assert.ok(marathon > 3.5 * 3600 && marathon < 4.5 * 3600, `marathon ${marathon}`);
});

test("racePredictions: returns the four standard distances in order", () => {
  const preds = racePredictions(5000, 25 * 60);
  assert.deepEqual(preds.map((p) => p.label), ["5K", "10K", "Half", "Marathon"]);
  // 5k prediction from a 5k reference is ~ the reference itself.
  assert.ok(Math.abs(preds[0].seconds - 25 * 60) < 1);
});
