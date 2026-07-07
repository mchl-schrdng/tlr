import type { TrainingSnapshot } from "./types";

export const AI_ANALYST_CONTENT_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ready", "caution", "recovery", "calibrating"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    headline: { type: "string" },
    summary: { type: "string" },
    mainLimiter: { type: "string" },
    nextSession: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["rest", "easy", "long_easy", "tempo", "intervals", "test", "unknown"],
        },
        prescription: { type: "string" },
        why: { type: "string" },
      },
      required: ["type", "prescription", "why"],
    },
    watch: {
      type: "array",
      items: { type: "string" },
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          value: { type: "string" },
          interpretation: { type: "string" },
        },
        required: ["label", "value", "interpretation"],
      },
    },
    caveat: { type: "string" },
  },
  required: [
    "status",
    "confidence",
    "headline",
    "summary",
    "mainLimiter",
    "nextSession",
    "watch",
    "evidence",
    "caveat",
  ],
} as const;

export function buildAnalystPrompt(snapshot: TrainingSnapshot): string {
  const language = snapshot.locale === "fr" ? "French" : "English";

  return [
    "You are Tailor's AI training analyst. Tailor builds custom training intelligence from Strava data.",
    `Write in ${language}.`,
    "The deterministic metrics in the JSON snapshot are the source of truth. Never invent numbers, dates, workouts, injuries or health facts.",
    "Your job is to translate the metrics into a short, precise decision memo for today's training.",
    "Prioritize: current load risk, fatigue/form, durability, heart-rate drift, progression, then race-model signals.",
    "If signals conflict, say what dominates and why. If data is weak, lower confidence and say what is missing.",
    "The nextSession prescription must be concrete: duration or distance range, intensity/zone, and what to avoid.",
    "Use evidence items for the exact metrics that justify the recommendation.",
    "Do not provide medical diagnosis. Do not use markdown. Return only JSON matching the schema.",
    "",
    "SNAPSHOT_JSON:",
    JSON.stringify(snapshot),
  ].join("\n");
}

