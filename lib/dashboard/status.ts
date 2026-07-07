import { ACWR_LOW, ACWR_HIGH, ACWR_DANGER } from "@/lib/config";
import type { hardDayPattern } from "@/lib/metrics/dashboard";
import type { Dictionary } from "@/lib/i18n/dict";

// Pure copy/status + path-to-green helpers for the dashboard. The branching logic
// lives here; the localized strings come from the dictionary `t` passed in, so
// nothing here is hard-coded to a language. No React, no I/O.

type HardPattern = ReturnType<typeof hardDayPattern> | null;
const lo = String(ACWR_LOW);
const hi = String(ACWR_HIGH);

export function acwrPill(t: Dictionary, ratio: number | null): { cls: string; text: string } {
  const p = t.dash.pill;
  if (ratio === null) return { cls: "warn", text: p.calibrating };
  if (ratio > ACWR_DANGER) return { cls: "bad", text: p.overload };
  if (ratio > ACWR_HIGH) return { cls: "warn", text: p.high };
  if (ratio < ACWR_LOW) return { cls: "warn", text: p.low };
  return { cls: "good", text: p.stable };
}

export function acwrCopy(t: Dictionary, ratio: number | null): { label: string; line: string; cls: string } {
  const a = t.dash.acwr;
  if (ratio === null) return { ...a.calibrating, cls: "warn" };
  if (ratio > ACWR_DANGER) return { ...a.overload, cls: "bad" };
  if (ratio > ACWR_HIGH) return { ...a.high, cls: "warn" };
  if (ratio < ACWR_LOW) return { ...a.low, cls: "warn" };
  return { ...a.stable, cls: "good" };
}

export function riskPill(t: Dictionary, level: "low" | "moderate" | "high"): { cls: string; text: string } {
  if (level === "high") return { cls: "bad", text: t.dash.risk.high };
  if (level === "moderate") return { cls: "warn", text: t.dash.risk.watch };
  return { cls: "good", text: t.dash.risk.low };
}

export function formCopy(t: Dictionary, form: number | null): { label: string; cls: string; line: string } {
  const f = t.dash.form;
  if (form == null) return { ...f.calibrating, cls: "warn" };
  if (form >= 10 && form <= 25) return { ...f.fresh, cls: "good" };
  if (form > 25) return { ...f.veryFresh, cls: "warn" };
  if (form < -20) return { ...f.fatigued, cls: "bad" };
  if (form < -10) return { ...f.loaded, cls: "warn" };
  return { ...f.training, cls: "good" };
}

export function signalCopy(t: Dictionary, eligible: number, total: number): { cls: string; label: string } {
  const s = t.dash.signal;
  if (total === 0) return { cls: "warn", label: s.calibrating };
  const pct = eligible / total;
  if (pct >= 0.95) return { cls: "good", label: s.clean };
  if (pct >= 0.85) return { cls: "warn", label: s.filtered };
  return { cls: "bad", label: s.noisy };
}

export function driftCopy(t: Dictionary, percent: number | null): { cls: string; label: string; line: string } {
  const d = t.dash.drift;
  if (percent == null) return { ...d.calibrating, cls: "warn" };
  if (percent <= 5) return { ...d.durable, cls: "good" };
  if (percent <= 8) return { ...d.watch, cls: "warn" };
  return { ...d.fragile, cls: "bad" };
}

export function hardSpacingCopy(t: Dictionary, pattern: HardPattern): { cls: string; label: string; line: string } {
  const s = t.dash.spacing;
  if (!pattern || pattern.totalRuns === 0) return { ...s.calibrating, cls: "warn" };
  if (pattern.hardDays >= 5 || pattern.backToBackHardDays >= 2) return { ...s.dense, cls: "bad" };
  if (pattern.hardDays >= 3 || pattern.backToBackHardDays >= 1) return { ...s.watch, cls: "warn" };
  return { ...s.spaced, cls: "good" };
}

export function signed(value: number | null, decimals = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(decimals)}`;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export type CurrentReadout = { cls: "good" | "warn" | "bad"; label: string; title: string; body: string; action: string };

export type GreenPath = {
  restDays: number | null; noHardDays: number | null; loadDays: number | null;
  formDays: number | null; spacingDays: number | null;
  title: string; action: string; checkpoint: string;
};

function projectedAcwrRatio(loads: number[], restDays: number): number | null {
  const window = loads.slice(-28);
  for (let i = 0; i < restDays; i++) {
    window.push(0);
    if (window.length > 28) window.shift();
  }
  const chronic = window.reduce((sum, load) => sum + load, 0) / 28;
  if (chronic <= 0) return null;
  const acute = window.slice(-7).reduce((sum, load) => sum + load, 0) / 7;
  return acute / chronic;
}

function daysUntilLoadGreen(loads: number[], ratio: number | null): number | null {
  if (ratio == null || loads.length === 0) return null;
  if (ratio <= ACWR_HIGH) return 0;
  for (let days = 1; days <= 14; days++) {
    const projected = projectedAcwrRatio(loads, days);
    if (projected != null && projected <= ACWR_HIGH) return days;
  }
  return 14;
}

function daysUntilFormGreen(fitness: number | null, fatigue: number | null, form: number | null): number | null {
  if (fitness == null || fatigue == null || form == null) return null;
  if (form >= -10 && form <= 25) return 0;
  if (form > 25) return 0;
  const fitnessAlpha = 1 - Math.exp(-1 / 42);
  const fatigueAlpha = 1 - Math.exp(-1 / 7);
  let projectedFitness = fitness;
  let projectedFatigue = fatigue;
  for (let days = 1; days <= 21; days++) {
    projectedFitness += (0 - projectedFitness) * fitnessAlpha;
    projectedFatigue += (0 - projectedFatigue) * fatigueAlpha;
    if (projectedFitness - projectedFatigue >= -10) return days;
  }
  return 21;
}

function daysUntilSpacingGreen(pattern: HardPattern): number | null {
  if (!pattern || pattern.totalRuns === 0) return null;
  for (let days = 0; days <= pattern.windowDays; days++) {
    const window = [
      ...pattern.days.slice(days),
      ...Array.from({ length: days }, () => ({ hardCount: 0 })),
    ];
    const hardDays = window.filter((day) => day.hardCount > 0).length;
    let backToBack = 0;
    for (let i = 1; i < window.length; i++) {
      if (window[i - 1].hardCount > 0 && window[i].hardCount > 0) backToBack += 1;
    }
    if (hardDays < 3 && backToBack === 0) return days;
  }
  return pattern.windowDays;
}

export function daysText(t: Dictionary, days: number | null): string {
  const d = t.dash.days;
  if (days == null) return d.needsData;
  if (days === 0) return d.greenNow;
  if (days === 1) return d.restOne;
  return d.rest(days);
}

export function noHardDaysText(t: Dictionary, days: number | null): string {
  const d = t.dash.days;
  if (days == null) return d.needsData;
  if (days === 0) return d.greenNow;
  if (days === 1) return d.noHardOne;
  return d.noHard(days);
}

export function buildGreenPath(
  t: Dictionary,
  {
    dailyLoads, acwrRatio, fitness, fatigue, form, hardPattern, drift, easyPace,
  }: {
    dailyLoads: Array<{ load: number }>;
    acwrRatio: number | null;
    fitness: number | null;
    fatigue: number | null;
    form: number | null;
    hardPattern: HardPattern;
    drift: number | null;
    easyPace: string | null;
  },
): GreenPath {
  const g = t.dash.green;
  const loadDays = daysUntilLoadGreen(dailyLoads.map((day) => day.load), acwrRatio);
  const formDays = daysUntilFormGreen(fitness, fatigue, form);
  const spacingDays = daysUntilSpacingGreen(hardPattern);
  const restDays = Math.max(0, ...[loadDays, formDays].filter((n): n is number => n != null));
  const noHardDays = Math.max(restDays, spacingDays ?? 0);
  const pace = easyPace ? g.pace(easyPace) : "";
  const driftNote = drift != null && drift > 5 ? g.driftNote : "";
  const base = { restDays, noHardDays, loadDays, formDays, spacingDays };

  if (acwrRatio != null && acwrRatio < ACWR_LOW) {
    return { ...base, title: g.buildTitle, action: g.buildAction(pace), checkpoint: g.buildCheck(lo, hi) };
  }
  if (restDays >= 3) {
    return { ...base, title: g.offTitle(restDays, noHardDays), action: g.offAction(restDays, noHardDays, pace), checkpoint: g.offCheck(driftNote) };
  }
  if (restDays === 2) {
    return { ...base, title: g.off2Title(noHardDays), action: g.off2Action(noHardDays, pace), checkpoint: g.off2Check(hi, driftNote) };
  }
  if (restDays === 1) {
    return { ...base, title: g.off1Title(noHardDays), action: g.off1Action(noHardDays, pace), checkpoint: g.off1Check(driftNote) };
  }
  if (noHardDays > 0) {
    return { ...base, title: g.easyTitle(noHardDays), action: g.easyAction(noHardDays, pace), checkpoint: g.easyCheck(driftNote) };
  }
  if (drift != null && drift > 5) {
    return { ...base, title: g.durabTitle, action: g.durabAction(pace), checkpoint: g.durabCheck };
  }
  return { ...base, title: g.qualityTitle, action: g.qualityAction, checkpoint: g.qualityCheck(lo, hi) };
}

export function currentReadout(
  t: Dictionary,
  {
    acwrRatio, form, hardPattern, drift,
  }: { acwrRatio: number | null; form: number | null; hardPattern: HardPattern; drift: number | null },
): CurrentReadout {
  const r = t.dash.readout;
  const label = t.dash.synthesis;
  const overloaded = acwrRatio != null && acwrRatio > ACWR_DANGER;
  const hotLoad = acwrRatio != null && acwrRatio > ACWR_HIGH;
  const lowLoad = acwrRatio != null && acwrRatio < ACWR_LOW;
  const deepFatigue = form != null && form < -20;
  const veryFresh = form != null && form > 25;
  const denseIntensity = hardPattern != null && (hardPattern.hardDays >= 5 || hardPattern.backToBackHardDays >= 2);
  const fragileDurability = drift != null && drift > 8;

  if (overloaded || deepFatigue) return { cls: "bad", label, ...r.recovery };
  if (hotLoad || denseIntensity || fragileDurability) return { cls: "warn", label, ...r.hold };
  if (lowLoad || veryFresh) return { cls: "warn", label, ...r.rebuild };
  return { cls: "good", label, ...r.green };
}

// The dashboard's "now": real wall-clock time, unless the latest run is in the
// future (clock skew / timezone), in which case use that.
export function dashboardClock(latestRun: { start_date: string } | undefined): Date {
  const realNow = new Date();
  if (!latestRun) return realNow;
  const latest = new Date(latestRun.start_date);
  return latest.getTime() > realNow.getTime() ? latest : realNow;
}
