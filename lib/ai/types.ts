type AiProvider = "gemini" | "local";

type AiAnalystStatus = "ready" | "caution" | "recovery" | "calibrating";

type AiAnalystConfidence = "low" | "medium" | "high";

type AiNextSessionType =
  | "rest"
  | "easy"
  | "long_easy"
  | "tempo"
  | "intervals"
  | "test"
  | "unknown";

type AiEvidence = {
  label: string;
  value: string;
  interpretation: string;
};

type AiNextSession = {
  type: AiNextSessionType;
  prescription: string;
  why: string;
};

type AiAnalystContent = {
  status: AiAnalystStatus;
  confidence: AiAnalystConfidence;
  headline: string;
  summary: string;
  mainLimiter: string;
  nextSession: AiNextSession;
  watch: string[];
  evidence: AiEvidence[];
  caveat: string;
};

export type AiAnalystResult = AiAnalystContent & {
  version: 1;
  provider: AiProvider;
  model: string;
  generatedAt: string;
};

export type TrainingSnapshot = {
  version: 1;
  locale: string;
  generatedAt: string;
  asOf: string;
  connected: boolean;
  history: {
    runs: number;
    totalKm: number;
    latestRunDate: string | null;
    thisWeekKm: number;
    last28Km: number;
    last28Hours: number;
  };
  current: {
    readout: {
      cls: "good" | "warn" | "bad";
      label: string;
      title: string;
      body: string;
      action: string;
    };
    greenPath: {
      title: string;
      action: string;
      checkpoint: string;
      loadDays: number | null;
      formDays: number | null;
      spacingDays: number | null;
    };
    load: {
      acwr: number | null;
      label: string;
      line: string;
      rampPct: number | null;
      monotony: number | null;
      strain: number | null;
    };
    form: {
      fitness: number | null;
      fatigue: number | null;
      form: number | null;
      label: string;
      line: string;
    };
    intensity: {
      hardDays14: number;
      hardRuns14: number;
      backToBackHardDays: number;
      easyPct: number | null;
      hardPct: number | null;
      label: string;
      line: string;
    };
    durability: {
      recentDriftPct: number | null;
      samples: number;
      label: string;
      line: string;
    };
    readiness: {
      score: number;
      label: string;
      line: string;
      limiter: string;
      factors: string[];
    };
    consistency: {
      runDays28: number | null;
      activePct28: number | null;
      currentStreak: number | null;
      longRunKm28: number | null;
      longRunSharePct28: number | null;
    };
  };
  performance: {
    criticalSpeed: {
      pace: string | null;
      grade: string | null;
      easyCeiling: string | null;
      thresholdBand: string | null;
    };
    heartRateZones: {
      source: string;
      lthrBpm: number | null;
      zones: Array<{ label: string; from: number; to: number | null }>;
    };
    vo2: {
      latest: number | null;
      best: number | null;
      delta: number | null;
      target: string;
    };
    durability: {
      grade: string | null;
      scorePct: number | null;
      longRuns: number | null;
    };
    powerCurve: Array<{ duration: string; watts: number; wattsPerKg: number | null }>;
    personalBests: Array<{ distance: string; time: string; pace: string }>;
    predictions: Array<{ distance: string; time: string; pace: string }>;
  };
  trends: {
    weeklyLoadKm: Array<{ date: string; km: number }>;
    longRunsKm: Array<{ date: string; km: number }>;
    quarterlyPaceHr: Array<{ label: string; pace: string | null; hr: number | null }>;
    yearlyPaceHr: Array<{ label: string; pace: string | null; hr: number | null }>;
  };
  evidence: {
    recentRuns: Array<{
      date: string;
      distanceKm: number;
      durationMin: number | null;
      pace: string | null;
      avgHr: number | null;
      elevationM: number | null;
    }>;
    deterministicRecommendations: string[];
    insights: Array<{ title: string; body: string }>;
    signalQuality: {
      hrRuns: number;
      paceRuns: number;
      outdoorRuns: number;
      indoorRuns: number;
    };
    surfaces: Array<{ surface: string; runs: number; km: number; sharePct: number }>;
  };
};

const statuses: AiAnalystStatus[] = ["ready", "caution", "recovery", "calibrating"];
const confidences: AiAnalystConfidence[] = ["low", "medium", "high"];
const sessionTypes: AiNextSessionType[] = [
  "rest",
  "easy",
  "long_easy",
  "tempo",
  "intervals",
  "test",
  "unknown",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function asEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function asStringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value.filter((item): item is string => typeof item === "string").map((item) => item.trim());
  return items.filter(Boolean).slice(0, 5);
}

function asEvidenceList(value: unknown): AiEvidence[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((item) => ({
      label: asString(item.label, "Signal"),
      value: asString(item.value, "n/a"),
      interpretation: asString(item.interpretation, "No interpretation provided."),
    }))
    .slice(0, 6);
}

export function normalizeAiAnalystContent(value: unknown): AiAnalystContent {
  if (!isRecord(value)) {
    throw new Error("AI analyst response is not an object.");
  }

  const nextSession = isRecord(value.nextSession) ? value.nextSession : {};

  return {
    status: asEnum(value.status, statuses, "calibrating"),
    confidence: asEnum(value.confidence, confidences, "low"),
    headline: asString(value.headline, "Training signal is incomplete."),
    summary: asString(value.summary, "The app could not extract a reliable narrative from the current data."),
    mainLimiter: asString(value.mainLimiter, "Insufficient signal"),
    nextSession: {
      type: asEnum(nextSession.type, sessionTypes, "unknown"),
      prescription: asString(nextSession.prescription, "Keep the next session easy until the load signal is clearer."),
      why: asString(nextSession.why, "The deterministic metrics do not support a harder recommendation."),
    },
    watch: asStringList(value.watch, ["Load, fatigue and heart-rate drift."]),
    evidence: asEvidenceList(value.evidence),
    caveat: asString(
      value.caveat,
      "This is training guidance from activity data, not medical advice."
    ),
  };
}
