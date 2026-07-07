import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAiAnalystContent } from "./types";

test("normalizeAiAnalystContent accepts a valid analyst payload", () => {
  const content = normalizeAiAnalystContent({
    status: "ready",
    confidence: "high",
    headline: "Quality available",
    summary: "The load signal is clean.",
    mainLimiter: "None",
    nextSession: {
      type: "tempo",
      prescription: "20 min easy, 3 x 6 min threshold, 10 min easy.",
      why: "Load and form are inside range.",
    },
    watch: ["Hard-day spacing"],
    evidence: [{ label: "ACWR", value: "1.1", interpretation: "inside target" }],
    caveat: "Not medical advice.",
  });

  assert.equal(content.status, "ready");
  assert.equal(content.nextSession.type, "tempo");
  assert.equal(content.evidence[0].label, "ACWR");
});

test("normalizeAiAnalystContent clamps unknown enum values to safe defaults", () => {
  const content = normalizeAiAnalystContent({
    status: "moon",
    confidence: "certain",
    headline: "",
    summary: "",
    mainLimiter: "",
    nextSession: { type: "rocket" },
  });

  assert.equal(content.status, "calibrating");
  assert.equal(content.confidence, "low");
  assert.equal(content.nextSession.type, "unknown");
  assert.ok(content.headline.length > 0);
});

