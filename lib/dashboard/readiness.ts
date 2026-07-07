import { ACWR_LOW, ACWR_HIGH, ACWR_DANGER } from "@/lib/config";
import { signed } from "@/lib/dashboard/status";
import type { hardDayPattern } from "@/lib/metrics/dashboard";

// Composite race-readiness score (0-100): each of load, form, intensity spacing
// and durability applies a penalty; the worst factor is surfaced as the limiter.
// Pure logic — the caller passes already-localized labels.

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export type ReadinessLabels = {
  load: string;
  form: string;
  intensity: string;
  durability: string;
  noData: string;
  limiterNone: string;
  limiterLoad: string;
  limiterForm: string;
  limiterIntensity: string;
  limiterDurability: string;
  ready: { label: string; line: string };
  sharpen: { label: string; line: string };
  absorb: { label: string; line: string };
  blocked: { label: string; line: string };
};

type ReadinessFactor = {
  label: string;
  value: string;
  penalty: number;
  limiter: string;
  score: number;
};

export function buildRaceReadiness({
  acwrRatio,
  form,
  drift,
  hardPattern,
  labels,
}: {
  acwrRatio: number | null;
  form: number | null;
  drift: number | null;
  hardPattern: ReturnType<typeof hardDayPattern> | null;
  labels: ReadinessLabels;
}) {
  const loadPenalty =
    acwrRatio == null ? 8 : acwrRatio > ACWR_DANGER ? 32 : acwrRatio > ACWR_HIGH ? 20 : acwrRatio < ACWR_LOW ? 10 : 0;
  const formPenalty = form == null ? 8 : form < -30 ? 30 : form < -20 ? 24 : form < -10 ? 12 : form > 25 ? 8 : 0;
  const hardPenalty = hardPattern
    ? Math.min(18, (hardPattern.hardDays > 5 ? 12 : hardPattern.hardDays > 3 ? 6 : 0) + (hardPattern.backToBackHardDays > 0 ? 8 : 0))
    : 5;
  const driftPenalty = drift == null ? 6 : drift > 10 ? 14 : drift > 8 ? 10 : drift > 5 ? 6 : 0;
  const factors: ReadinessFactor[] = [
    {
      label: labels.load,
      value: acwrRatio != null ? acwrRatio.toFixed(2) : labels.noData,
      penalty: loadPenalty,
      limiter: labels.limiterLoad,
      score: clampScore(100 - (loadPenalty / 32) * 100),
    },
    {
      label: labels.form,
      value: form != null ? signed(form, 1) : labels.noData,
      penalty: formPenalty,
      limiter: labels.limiterForm,
      score: clampScore(100 - (formPenalty / 30) * 100),
    },
    {
      label: labels.intensity,
      value: hardPattern ? `${hardPattern.hardDays}/14` : labels.noData,
      penalty: hardPenalty,
      limiter: labels.limiterIntensity,
      score: clampScore(100 - (hardPenalty / 18) * 100),
    },
    {
      label: labels.durability,
      value: drift != null ? `${drift.toFixed(1)}%` : labels.noData,
      penalty: driftPenalty,
      limiter: labels.limiterDurability,
      score: clampScore(100 - (driftPenalty / 14) * 100),
    },
  ];
  const score = clampScore(100 - factors.reduce((sum, factor) => sum + factor.penalty, 0));
  const limiter = factors.reduce((worst, factor) => (factor.penalty > worst.penalty ? factor : worst), factors[0]);
  const state = score >= 82 ? labels.ready : score >= 66 ? labels.sharpen : score >= 45 ? labels.absorb : labels.blocked;
  const cls = score >= 82 ? "good" : score >= 66 ? "info" : score >= 45 ? "warn" : "bad";

  return {
    score,
    cls,
    label: state.label,
    line: state.line,
    limiter: limiter.penalty > 0 ? limiter.limiter : labels.limiterNone,
    factors,
  };
}
