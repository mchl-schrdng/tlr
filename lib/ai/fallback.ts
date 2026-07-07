import type { Dictionary } from "@/lib/i18n/dict";
import type { AiAnalystResult, TrainingSnapshot } from "./types";

function confidenceFromSnapshot(snapshot: TrainingSnapshot): "low" | "medium" | "high" {
  if (snapshot.history.runs < 20) return "low";
  if (snapshot.evidence.signalQuality.hrRuns < 8) return "medium";
  return "high";
}

function nextSession(t: Dictionary, snapshot: TrainingSnapshot) {
  const acwr = snapshot.current.load.acwr ?? 0;
  const form = snapshot.current.form.form ?? 0;

  if (acwr >= 1.5 || form <= -35) {
    return {
      type: "rest" as const,
      prescription: t.ai.restPrescription,
      why: t.ai.restWhy,
    };
  }

  // Non-overloaded: the deterministic green path already carries a concrete,
  // locale-aware aerobic prescription — reuse it instead of matching prose.
  return {
    type: "easy" as const,
    prescription: snapshot.current.greenPath.action,
    why: snapshot.current.greenPath.checkpoint,
  };
}

export function buildLocalAnalyst(t: Dictionary, snapshot: TrainingSnapshot, reason: string): AiAnalystResult {
  const session = nextSession(t, snapshot);
  const acwr = snapshot.current.load.acwr;
  const status =
    acwr !== null && acwr >= 1.5
      ? "recovery"
      : snapshot.current.readout.cls === "good"
        ? "ready"
        : snapshot.current.readout.cls === "bad"
          ? "recovery"
          : "caution";

  return {
    version: 1,
    provider: "local",
    model: reason,
    generatedAt: new Date().toISOString(),
    status,
    confidence: confidenceFromSnapshot(snapshot),
    headline: snapshot.current.readout.title,
    summary: snapshot.current.readout.body,
    mainLimiter: snapshot.current.readiness.limiter,
    nextSession: session,
    watch: [
      snapshot.current.load.line,
      snapshot.current.form.line,
      snapshot.current.durability.line,
    ].filter(Boolean),
    evidence: [
      {
        label: t.lbl.load,
        value: acwr === null ? "n/a" : `${acwr}`,
        interpretation: snapshot.current.load.line,
      },
      {
        label: t.lbl.form,
        value: snapshot.current.form.form === null ? "n/a" : `${snapshot.current.form.form}`,
        interpretation: snapshot.current.form.line,
      },
      {
        label: t.lbl.thisWeek,
        value: `${snapshot.history.thisWeekKm} km`,
        interpretation: snapshot.current.greenPath.checkpoint,
      },
    ],
    caveat: t.ai.localCaveat,
  };
}
