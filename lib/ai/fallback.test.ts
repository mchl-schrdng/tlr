import assert from "node:assert/strict";
import test from "node:test";
import { buildLocalAnalyst } from "./fallback";
import { dictionaries } from "@/lib/i18n/dict";
import type { TrainingSnapshot } from "./types";

const en = dictionaries.en;
const fr = dictionaries.fr;

const baseSnapshot: TrainingSnapshot = {
  version: 1,
  locale: "en",
  generatedAt: "2026-07-07T10:00:00.000Z",
  asOf: "2026-07-07T10:00:00.000Z",
  connected: true,
  history: {
    runs: 100,
    totalKm: 700,
    latestRunDate: "2026-07-07",
    thisWeekKm: 22,
    last28Km: 120,
    last28Hours: 10,
  },
  current: {
    readout: {
      cls: "warn",
      label: "Rule-based synthesis",
      title: "Hold the line.",
      body: "Load is productive but constrained.",
      action: "Run easy.",
    },
    greenPath: {
      title: "One quiet day.",
      action: "Take 24h off running, then 35-45 min easy Z1-Z2.",
      checkpoint: "Green = load back inside target.",
      loadDays: 1,
      formDays: 0,
      spacingDays: 1,
    },
    load: {
      acwr: 1.62,
      label: "Overload",
      line: "Acute load is too high.",
      rampPct: 40,
      monotony: 1.2,
      strain: 120,
    },
    form: {
      fitness: 30,
      fatigue: 75,
      form: -45,
      label: "Fatigued",
      line: "Deep fatigue.",
    },
    intensity: {
      hardDays14: 3,
      hardRuns14: 4,
      backToBackHardDays: 1,
      easyPct: 70,
      hardPct: 15,
      label: "Watch spacing",
      line: "Hard days are dense.",
    },
    durability: {
      recentDriftPct: 6.8,
      samples: 4,
      label: "watch",
      line: "Drift is visible.",
    },
    readiness: {
      score: 42,
      label: "Absorb first.",
      line: "Fitness is present but hidden by load.",
      limiter: "Load control",
      factors: ["Load", "Form"],
    },
    consistency: {
      runDays28: 16,
      activePct28: 57,
      currentStreak: 2,
      longRunKm28: 18,
      longRunSharePct28: 15,
    },
  },
  performance: {
    criticalSpeed: { pace: "3:40 /km", grade: "300 m D'", easyCeiling: "4:34 /km", thresholdBand: "3:39 /km-4:03 /km" },
    heartRateZones: { source: "estimated", lthrBpm: 187, zones: [] },
    vo2: { latest: 57, best: 58, delta: 1.2, target: "5K" },
    durability: { grade: "moderate", scorePct: 7.5, longRuns: 10 },
    powerCurve: [],
    personalBests: [],
    predictions: [],
  },
  trends: {
    weeklyLoadKm: [],
    longRunsKm: [],
    quarterlyPaceHr: [],
    yearlyPaceHr: [],
  },
  evidence: {
    recentRuns: [],
    deterministicRecommendations: [],
    insights: [],
    signalQuality: { hrRuns: 90, paceRuns: 90, outdoorRuns: 90, indoorRuns: 10 },
    surfaces: [],
  },
};

function greenSnapshot(): TrainingSnapshot {
  const snap = structuredClone(baseSnapshot);
  snap.current.readout.cls = "good";
  snap.current.readout.title = "Green light.";
  snap.current.load.acwr = 1.0;
  snap.current.form.form = -5;
  return snap;
}

test("buildLocalAnalyst gives recovery guidance when load and form are red", () => {
  const result = buildLocalAnalyst(en, baseSnapshot, "test");

  assert.equal(result.provider, "local");
  assert.equal(result.status, "recovery");
  assert.equal(result.nextSession.type, "rest");
  assert.equal(result.mainLimiter, "Load control");
  assert.ok(result.evidence.length >= 3);
});

test("buildLocalAnalyst reaches the ready status on a green snapshot", () => {
  const result = buildLocalAnalyst(en, greenSnapshot(), "test");

  assert.equal(result.status, "ready");
  assert.equal(result.nextSession.type, "easy");
  // Non-overloaded prescription reuses the deterministic, localized green path.
  assert.equal(result.nextSession.prescription, greenSnapshot().current.greenPath.action);
});

test("buildLocalAnalyst emits French copy for a French dictionary (no English leakage)", () => {
  const result = buildLocalAnalyst(fr, baseSnapshot, "test");

  assert.equal(result.status, "recovery");
  assert.equal(result.nextSession.prescription, fr.ai.restPrescription);
  assert.equal(result.nextSession.why, fr.ai.restWhy);
  assert.equal(result.caveat, fr.ai.localCaveat);
  assert.equal(result.evidence[0].label, fr.lbl.load);
  assert.equal(result.evidence[1].label, fr.lbl.form);
  assert.equal(result.evidence[2].label, fr.lbl.thisWeek);
  // The fallback's own copy must not contain the English defaults.
  assert.notEqual(result.caveat, en.ai.localCaveat);
});
