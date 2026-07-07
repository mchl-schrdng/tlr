import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weeklyVolume,
  computeAcwr,
  efficiencyTrend,
  bestEffort,
  activityLoad,
} from "@/lib/metrics/aggregate";
import type { ActivityRow, StreamSet } from "@/lib/db";

function run(partial: Partial<ActivityRow>): ActivityRow {
  return {
    id: 1,
    name: "r",
    start_date: "2026-06-01T07:00:00Z",
    type: "Run",
    distance: 10000,
    moving_time: 3000,
    elapsed_time: 3000,
    avg_hr: 150,
    max_hr: 170,
    elevation_gain: 50,
    avg_cadence: 170,
    avg_speed: 3.3,
    suffer_score: null,
    ...partial,
  };
}

test("weeklyVolume: returns `weeks` buckets, newest last, zero-filled", () => {
  const now = new Date("2026-07-01T12:00:00");
  const acts = [run({ start_date: "2026-06-30T07:00:00", distance: 5000 })];
  const weeks = weeklyVolume(acts, 12, now);
  assert.equal(weeks.length, 12);
  const last = weeks[weeks.length - 1];
  assert.ok(Math.abs(last.km - 5) < 0.001, `last week km ${last.km}`);
  assert.equal(last.count, 1);
  assert.equal(weeks[0].km, 0); // 12 weeks ago empty
});

test("activityLoad: prefers suffer_score, else minutes", () => {
  assert.equal(activityLoad(run({ suffer_score: 80 })), 80);
  assert.equal(activityLoad(run({ suffer_score: null, moving_time: 1800 })), 30);
});

test("computeAcwr: steady load -> ratio ~1", () => {
  const now = new Date("2026-07-01T12:00:00Z");
  const acts: ActivityRow[] = [];
  // One run every day for 28 days, constant load 50.
  for (let i = 0; i < 28; i++) {
    const d = new Date(now.getTime() - i * 86400_000);
    acts.push(run({ id: i, start_date: d.toISOString(), suffer_score: 50 }));
  }
  const acwr = computeAcwr(acts, now);
  assert.ok(acwr.ratio !== null);
  assert.ok(Math.abs(acwr.ratio! - 1) < 0.05, `ratio ${acwr.ratio}`);
});

test("computeAcwr: spike in last week -> ratio > 1.5", () => {
  const now = new Date("2026-07-01T12:00:00Z");
  const acts: ActivityRow[] = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(now.getTime() - i * 86400_000);
    acts.push(run({ id: i, start_date: d.toISOString(), suffer_score: i < 7 ? 100 : 20 }));
  }
  const acwr = computeAcwr(acts, now);
  assert.ok(acwr.ratio! > 1.5, `ratio ${acwr.ratio}`);
});

test("computeAcwr: uses TRIMP streams when available", () => {
  const now = new Date("2026-07-01T12:00:00Z");
  const acts: ActivityRow[] = [];
  const streams = new Map<number, StreamSet>();
  for (let i = 0; i < 28; i++) {
    const d = new Date(now.getTime() - i * 86400_000);
    acts.push(run({ id: i, start_date: d.toISOString(), suffer_score: 50, moving_time: 3600 }));
    streams.set(i, { time: [0, 3600], heartrate: [i < 7 ? 170 : 110, i < 7 ? 170 : 110] });
  }

  const proxyAcwr = computeAcwr(acts, now);
  const streamAcwr = computeAcwr(acts, now, (id) => streams.get(id) ?? null);

  assert.ok(proxyAcwr.ratio !== null);
  assert.ok(streamAcwr.ratio !== null);
  assert.ok(Math.abs(proxyAcwr.ratio! - 1) < 0.05, `proxy ratio ${proxyAcwr.ratio}`);
  assert.ok(streamAcwr.ratio! > 1.5, `stream ratio ${streamAcwr.ratio}`);
});

test("computeAcwr: no data -> ratio null", () => {
  assert.equal(computeAcwr([], new Date()).ratio, null);
});

test("efficiencyTrend: filters missing HR, sorts by date", () => {
  const pts = efficiencyTrend([
    run({ start_date: "2026-06-10T07:00:00Z", avg_hr: 150, avg_speed: 3.5 }),
    run({ start_date: "2026-06-01T07:00:00Z", avg_hr: null }),
    run({ start_date: "2026-06-05T07:00:00Z", avg_hr: 150, avg_speed: 3.3 }),
  ]);
  assert.equal(pts.length, 2); // one dropped (no HR)
  assert.equal(pts[0].date, "2026-06-05");
  assert.ok(pts[1].ef > pts[0].ef); // faster (3.5) at same HR later = higher EF
});

test("bestEffort: 1km within a steady 3km run at 3 m/s ~ 333s", () => {
  const time: number[] = [];
  const dist: number[] = [];
  for (let i = 0; i <= 1000; i++) {
    time.push(i);
    dist.push(i * 3);
  }
  const streams: StreamSet = { time, distance: dist };
  const e = bestEffort(streams, 1000);
  assert.ok(e);
  assert.ok(Math.abs(e!.seconds - 1000 / 3) < 2, `seconds ${e!.seconds}`);
});

test("bestEffort: run shorter than target -> null", () => {
  const streams: StreamSet = { time: [0, 100], distance: [0, 500] };
  assert.equal(bestEffort(streams, 1000), null);
});

test("bestEffort: finds the fast segment", () => {
  // 2km slow (2 m/s) then 1km fast (5 m/s). Best 1k should be ~200s.
  const time: number[] = [0];
  const dist: number[] = [0];
  let t = 0, d = 0;
  while (d < 2000) { d += 2; t += 1; time.push(t); dist.push(d); }
  while (d < 3000) { d += 5; t += 1; time.push(t); dist.push(d); }
  const e = bestEffort({ time, distance: dist }, 1000);
  assert.ok(e);
  assert.ok(e!.seconds < 230, `best 1k seconds ${e!.seconds}`);
});
