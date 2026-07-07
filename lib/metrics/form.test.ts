import { test } from "node:test";
import assert from "node:assert/strict";
import { strideMetrics, splitBalance, intensityModel, injuryRisk } from "@/lib/metrics/form";
import type { StreamSet } from "@/lib/db";

// ---- helpers ----

// Build a stream with `n+1` samples (indices 0..n), one per second, with a
// per-sample cadence and (optionally) a constant velocity_smooth.
function cadenceStream(cadences: number[], speed: number | null): StreamSet {
  const n = cadences.length;
  const time = Array.from({ length: n }, (_, i) => i);
  const s: StreamSet = { time, cadence: cadences };
  if (speed != null) s.velocity_smooth = cadences.map(() => speed);
  return s;
}

// Constant-speed run: distance grows linearly with time.
function linearRun(points: number, speedMps: number): StreamSet {
  const time = Array.from({ length: points }, (_, i) => i);
  const distance = time.map((t) => t * speedMps);
  return { time, distance };
}

// ---- strideMetrics ----

test("strideMetrics: null when no cadence stream", () => {
  assert.equal(strideMetrics({}), null);
  assert.equal(strideMetrics({ time: [0, 1, 2], distance: [0, 3, 6] }), null);
  assert.equal(strideMetrics({ cadence: [] }), null);
});

test("strideMetrics: constant cadence + speed -> exact cadence/stride, zero drift", () => {
  const cadences = Array.from({ length: 61 }, () => 90); // single-leg spm
  const s = cadenceStream(cadences, 3); // 3 m/s
  const m = strideMetrics(s);
  assert.ok(m);
  assert.equal(m!.avgCadenceSpm, 180); // doubled to total steps/min
  assert.ok(Math.abs(m!.avgStrideM - 1) < 1e-9); // 3 / (180/60) = 1m
  assert.equal(m!.cadenceDriftPct, 0);
});

test("strideMetrics: cadence rises in 2nd half -> positive drift", () => {
  const cadences = [...Array(50).fill(80), ...Array(50).fill(90)];
  const s = cadenceStream(cadences, 3);
  const m = strideMetrics(s);
  assert.ok(m);
  assert.ok(Math.abs(m!.avgCadenceSpm - 170) < 1e-9); // mean(80,90)*2
  assert.ok(Math.abs(m!.cadenceDriftPct - 12.5) < 1e-6); // (180-160)/160*100
});

test("strideMetrics: no velocity_smooth -> speed derived from distance/time", () => {
  const run = linearRun(41, 4); // constant 4 m/s
  const s: StreamSet = { ...run, cadence: Array.from({ length: 41 }, () => 100) };
  const m = strideMetrics(s);
  assert.ok(m);
  assert.equal(m!.avgCadenceSpm, 200);
  assert.ok(Math.abs(m!.avgStrideM - 1.2) < 1e-6); // 4 / (200/60) = 1.2m
});

test("strideMetrics: no time stream -> falls back to a count-based split", () => {
  const cadences = [...Array(5).fill(70), ...Array(5).fill(90)];
  const s: StreamSet = { cadence: cadences }; // no time, no speed source
  const m = strideMetrics(s);
  assert.ok(m);
  assert.equal(m!.avgStrideM, 0); // no speed data available at all
  assert.ok(Math.abs(m!.cadenceDriftPct - 28.5714) < 1e-3); // (180-140)/140*100
});

test("strideMetrics: non-finite cadence samples are ignored, not fatal", () => {
  const s = { time: [0, 1, 2], cadence: [80, NaN, 90] } as unknown as StreamSet;
  const m = strideMetrics(s);
  assert.ok(m);
  assert.ok(Math.abs(m!.avgCadenceSpm - 170) < 1e-9); // mean(80,90)*2
});

// ---- splitBalance ----

test("splitBalance: null on missing/mismatched/unusable streams", () => {
  assert.equal(splitBalance({}), null);
  assert.equal(splitBalance({ distance: [0, 1, 2] }), null); // no time
  assert.equal(splitBalance({ time: [0, 1], distance: [0, 1, 2] }), null); // mismatched
  assert.equal(splitBalance({ time: [0, 1], distance: [0, 0] }), null); // no distance covered
  assert.equal(splitBalance({ time: [0, 1], distance: [0, 5] }), null); // too few points to split
});

test("splitBalance: steady pace -> equal halves, no negative split, zero drift", () => {
  const s = linearRun(101, 5); // 0..500m at constant 5 m/s
  const r = splitBalance(s);
  assert.ok(r);
  assert.ok(Math.abs(r!.firstHalfSpeed - 5) < 1e-9);
  assert.ok(Math.abs(r!.secondHalfSpeed - 5) < 1e-9);
  assert.equal(r!.negativeSplit, false);
  assert.ok(Math.abs(r!.driftPct) < 1e-9);
});

test("splitBalance: speeds up in 2nd half -> negative split, negative drift", () => {
  const n = 101;
  const time = Array.from({ length: n }, (_, i) => i);
  const distance = time.map((i) => (i <= 50 ? 4 * i : 200 + 6 * (i - 50)));
  const r = splitBalance({ time, distance });
  assert.ok(r);
  assert.equal(r!.negativeSplit, true);
  assert.ok(r!.secondHalfSpeed > r!.firstHalfSpeed);
  assert.ok(r!.driftPct < 0);
});

test("splitBalance: slows down in 2nd half -> positive split, positive drift", () => {
  const n = 101;
  const time = Array.from({ length: n }, (_, i) => i);
  const distance = time.map((i) => (i <= 50 ? 6 * i : 300 + 4 * (i - 50)));
  const r = splitBalance({ time, distance });
  assert.ok(r);
  assert.equal(r!.negativeSplit, false);
  assert.ok(r!.secondHalfSpeed < r!.firstHalfSpeed);
  assert.ok(r!.driftPct > 0);
});

// ---- intensityModel ----

test("intensityModel: all-zero input -> mixed with 0s", () => {
  assert.deepEqual(intensityModel([0, 0, 0, 0, 0]), {
    model: "mixed",
    easyPct: 0,
    hardPct: 0,
    midPct: 0,
  });
  assert.deepEqual(intensityModel([]), {
    model: "mixed",
    easyPct: 0,
    hardPct: 0,
    midPct: 0,
  });
});

test("intensityModel: classic polarized distribution", () => {
  const r = intensityModel([700, 100, 50, 100, 50]); // easy 80%, mid 5%, hard 15%
  assert.equal(r.model, "polarized");
  assert.ok(Math.abs(r.easyPct - 80) < 1e-9);
  assert.ok(Math.abs(r.midPct - 5) < 1e-9);
  assert.ok(Math.abs(r.hardPct - 15) < 1e-9);
});

test("intensityModel: mid is the largest share -> threshold", () => {
  const r = intensityModel([200, 100, 500, 100, 100]); // easy 30%, mid 50%, hard 20%
  assert.equal(r.model, "threshold");
});

test("intensityModel: easy > mid > hard (not polarized) -> pyramidal", () => {
  const r = intensityModel([300, 200, 300, 150, 50]); // easy 50%, mid 30%, hard 20%
  assert.equal(r.model, "pyramidal");
});

test("intensityModel: hard-dominant, non-threshold distribution -> mixed", () => {
  const r = intensityModel([100, 100, 150, 300, 350]); // easy 20%, mid 15%, hard 65%
  assert.equal(r.model, "mixed");
});

// ---- injuryRisk ----

test("injuryRisk: all-null input -> low, score 0, no reasons", () => {
  const r = injuryRisk({ acwr: null, monotony: null, strain: null, rampPct: null });
  assert.deepEqual(r, { level: "low", score: 0, reasons: [] });
});

test("injuryRisk: comfortable values -> low, score 0", () => {
  const r = injuryRisk({ acwr: 1.0, monotony: 1.0, strain: 1000, rampPct: 5 });
  assert.equal(r.level, "low");
  assert.equal(r.score, 0);
  assert.equal(r.reasons.length, 0);
});

test("injuryRisk: single rule over threshold -> low, score 1", () => {
  const r = injuryRisk({ acwr: null, monotony: null, strain: null, rampPct: 10.5 });
  assert.equal(r.level, "low");
  assert.equal(r.score, 1);
  assert.equal(r.reasons.length, 1);
});

test("injuryRisk: two rules -> moderate, score 2", () => {
  const r = injuryRisk({ acwr: null, monotony: 1.6, strain: null, rampPct: 10.5 });
  assert.equal(r.level, "moderate");
  assert.equal(r.score, 2);
  assert.equal(r.reasons.length, 2);
});

test("injuryRisk: low ACWR (detraining) also triggers the +1 rule", () => {
  const r = injuryRisk({ acwr: 0.7, monotony: null, strain: null, rampPct: null });
  assert.equal(r.score, 1);
  assert.equal(r.level, "low");
  assert.ok(r.reasons[0].toLowerCase().includes("acwr") || r.reasons[0].toLowerCase().includes("0.7"));
});

test("injuryRisk: stacked thresholds on multiple metrics -> high", () => {
  const r = injuryRisk({ acwr: 1.6, monotony: 2.1, strain: 1600, rampPct: 30 });
  // acwr: +2 (>1.5) +1 (>1.3) = 3
  // monotony: +2 (>2) +1 (>1.5) = 3
  // rampPct: +1 (>10) +2 (>25) = 3
  // strain: +1 (>1500) = 1
  assert.equal(r.score, 10);
  assert.equal(r.level, "high");
  assert.equal(r.reasons.length, 7);
});

test("injuryRisk: score exactly at the high boundary (4) is high", () => {
  // acwr 1.6 alone contributes 3 (>1.5 and >1.3); add rampPct 15 for +1 = 4.
  const r = injuryRisk({ acwr: 1.6, monotony: null, strain: null, rampPct: 15 });
  assert.equal(r.score, 4);
  assert.equal(r.level, "high");
});
