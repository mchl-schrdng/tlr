import { test } from "node:test";
import assert from "node:assert/strict";
import { coach } from "@/lib/coaching";
import type { ActivityRow } from "@/lib/db";
import { dictionaries } from "@/lib/i18n/dict";
const en = dictionaries.en;

function run(partial: Partial<ActivityRow>): ActivityRow {
  return {
    id: 1, name: "r", start_date: "2026-06-01T07:00:00Z", type: "Run",
    distance: 10000, moving_time: 3000, elapsed_time: 3000, avg_hr: 150, max_hr: 170,
    elevation_gain: 50, avg_cadence: 170, avg_speed: 3.3, suffer_score: null, ...partial,
  };
}

const NOW = new Date("2026-07-01T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400_000).toISOString();

test("coach: empty history warns about missing data", () => {
  const { recommendations } = coach(en, [], NOW);
  assert.ok(recommendations.some((r) => r.title.includes("Not enough data")));
});

test("coach: acute spike -> overload (bad)", () => {
  const acts: ActivityRow[] = [];
  for (let i = 0; i < 28; i++) acts.push(run({ id: i, start_date: daysAgo(i), suffer_score: i < 7 ? 120 : 15 }));
  const { recommendations } = coach(en, acts, NOW);
  assert.ok(recommendations.some((r) => r.level === "bad" && r.title.includes("Overload")));
});

test("coach: steady load -> balanced (good)", () => {
  const acts: ActivityRow[] = [];
  for (let i = 0; i < 28; i++) acts.push(run({ id: i, start_date: daysAgo(i), suffer_score: 50 }));
  const { recommendations, acwr } = coach(en, acts, NOW);
  assert.ok(acwr.ratio !== null && Math.abs(acwr.ratio - 1) < 0.05);
  assert.ok(recommendations.some((r) => r.title.includes("balanced")));
});

test("coach: high decoupling -> endurance recommendation", () => {
  const acts = [run({ start_date: daysAgo(1), suffer_score: 50 })];
  const { recommendations } = coach(en, acts, NOW, 9.5);
  assert.ok(recommendations.some((r) => r.title.includes("Aerobic base")));
});

test("coach: long layoff -> reprise", () => {
  const acts = [run({ start_date: daysAgo(9), suffer_score: 50 })];
  const { recommendations } = coach(en, acts, NOW);
  assert.ok(recommendations.some((r) => r.title.includes("Return carefully")));
});

test("coach: always suggests a next session", () => {
  const acts = [run({ start_date: daysAgo(2), suffer_score: 50 })];
  const { recommendations } = coach(en, acts, NOW);
  assert.ok(recommendations.some((r) => r.title.startsWith("Next session")));
});
