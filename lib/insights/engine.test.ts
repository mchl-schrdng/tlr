import { test } from "node:test";
import assert from "node:assert/strict";
import type { ActivityRow, StreamSet } from "@/lib/db";
import { buildInsights } from "@/lib/insights/engine";
import { dictionaries } from "@/lib/i18n/dict";
const en = dictionaries.en;

const now = new Date("2026-07-08T00:00:00.000Z");

function run(partial: Partial<ActivityRow>): ActivityRow {
  return {
    id: 1,
    name: "Run",
    start_date: "2026-07-07T07:00:00.000Z",
    type: "Run",
    distance: 6000,
    moving_time: 1800,
    elapsed_time: 1800,
    avg_hr: 160,
    max_hr: 175,
    elevation_gain: 20,
    avg_cadence: 170,
    avg_speed: 3.3,
    suffer_score: 70,
    ...partial,
  };
}

const noStream = () => null;

test("training-load insight reports the ratio and cites acute activities", () => {
  const acts = Array.from({ length: 6 }, (_, i) =>
    run({ id: i + 1, start_date: "2026-07-05T07:00:00.000Z", suffer_score: 90 }),
  );
  const ins = buildInsights({ t: en, activities: acts, getStream: noStream, now });
  const l = ins.find((i) => i.id === "training-load");
  assert.ok(l);
  assert.ok(l!.metric!.value.length > 0);
  assert.ok(l!.evidence.length > 0);
});

test("aerobic-base insight warns when decoupling is high", () => {
  const time: number[] = [];
  const distance: number[] = [];
  const heartrate: number[] = [];
  for (let i = 0; i <= 600; i++) {
    time.push(i);
    distance.push((distance[i - 1] ?? 0) + 3.3); // constant speed
    heartrate.push(i < 300 ? 150 : 165); // HR drifts up in the 2nd half
  }
  const stream: StreamSet = { activityId: "strava:1", time, distance, heartrate } as StreamSet;
  const ins = buildInsights({
    t: en,
    activities: [run({ id: 1 })],
    getStream: (id) => (id === 1 ? stream : null),
    now,
  });
  const b = ins.find((i) => i.id === "aerobic-base");
  assert.ok(b);
  assert.equal(b!.severity, "warn");
});

test("fitness-prediction insight appears with a reference effort and cites race times", () => {
  const ins = buildInsights({
    t: en,
    activities: [run({})],
    getStream: noStream,
    now,
    refEffort: { distanceM: 5000, seconds: 25 * 60 },
  });
  const f = ins.find((i) => i.id === "fitness-prediction");
  assert.ok(f);
  assert.equal(f!.metric!.label, "VDOT");
  // reference effort + 4 predicted race distances
  assert.equal(f!.evidence.length, 5);
  assert.ok(f!.evidence.some((e) => e.label === "Marathon"));
});

test("aerobic-efficiency insight flags improvement when pace-at-HR gets faster", () => {
  const DAY = 86400_000;
  const t0 = now.getTime();
  const mk = (id: number, daysAgo: number, speed: number) =>
    run({ id, start_date: new Date(t0 - daysAgo * DAY).toISOString(), avg_hr: 140, avg_speed: speed });
  const acts = [
    mk(1, 60, 3.0), mk(2, 63, 3.0), mk(3, 66, 3.0), // baseline window, slower at 140 bpm
    mk(4, 10, 3.2), mk(5, 13, 3.2), mk(6, 16, 3.2), // recent window, faster at 140 bpm
  ];
  const ins = buildInsights({ t: en, activities: acts, getStream: noStream, now });
  const e = ins.find((i) => i.id === "aerobic-efficiency");
  assert.ok(e);
  assert.equal(e!.severity, "good");
  assert.ok(e!.metric!.value.startsWith("+"));
  assert.ok(e!.evidence.length >= 2);
});

test("no insight emitted when there is no data", () => {
  const ins = buildInsights({ t: en, activities: [], getStream: noStream, now });
  assert.equal(ins.length, 0);
});
