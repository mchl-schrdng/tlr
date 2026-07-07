import { test } from "node:test";
import assert from "node:assert/strict";
import { mapActivity, mapGearFromAthlete, mapZones, mapAthlete, mapStreams } from "./map";

test("mapActivity normalizes units, namespaces ids, maps sport_type", () => {
  const raw = {
    id: 19167485894, name: "Course en soirée", sport_type: "Run", type: "Run",
    start_date: "2026-07-03T18:55:31Z", distance: 6704.1, moving_time: 2528,
    elapsed_time: 2528, total_elevation_gain: 26.5, average_heartrate: 164.4,
    max_heartrate: 176, average_speed: 2.65, average_cadence: 79.4,
    average_watts: null, suffer_score: 74, gear_id: "7221065", trainer: false,
  };
  const a = mapActivity(raw as any);
  assert.equal(a.id, "strava:19167485894");
  assert.equal(a.source, "strava");
  assert.equal(a.sport, "run");
  assert.equal(a.distanceM, 6704.1);
  assert.equal(a.relativeEffort, 74);
  assert.equal(a.gearId, "strava:7221065");
  assert.equal(a.isTrainer, false);
});

test("mapActivity maps ride and null gear", () => {
  const a = mapActivity({ id: 1, sport_type: "Ride", type: "Ride", gear_id: null,
    distance: 0, moving_time: 0, elapsed_time: 0, start_date: "2026-01-01T00:00:00Z",
    name: "x" } as any);
  assert.equal(a.sport, "ride");
  assert.equal(a.gearId, null);
});

test("mapGearFromAthlete flattens bikes+shoes", () => {
  const raw = {
    bikes: [{ id: "b1", name: "Giant TCR", distance: 652865, retired: false }],
    shoes: [{ id: "7221065", name: "Kiprun KS Light", distance: 3247921, retired: false }],
  };
  const gear = mapGearFromAthlete(raw as any);
  assert.equal(gear.length, 2);
  const shoe = gear.find((g) => g.id === "strava:7221065")!;
  assert.equal(shoe.type, "shoe");
  assert.equal(shoe.distanceM, 3247921);
});

test("mapZones reads hr zones and ftp from athlete", () => {
  const rawZones = { heart_rate: { zones: [{ min: 0, max: 130 }, { min: 131, max: 162 },
    { min: 163, max: 178 }, { min: 179, max: 194 }, { min: 195, max: -1 }] } };
  const z = mapZones(rawZones as any, { ftp: 167 } as any);
  assert.equal(z.hr.length, 5);
  assert.equal(z.hr[4].max, null);   // Strava's -1 upper bound → null
  assert.equal(z.ftp, 167);
});

test("mapAthlete namespaces id and builds name", () => {
  const a = mapAthlete({ id: 31849166, firstname: "Mchl", lastname: "Schrdng",
    sex: "M", weight: 75 } as any);
  assert.equal(a.id, "strava:31849166");
  assert.equal(a.name, "Mchl Schrdng");
  assert.equal(a.weightKg, 75);
  assert.equal(a.focus, null);
});

test("mapStreams renames keys and drops missing", () => {
  const raw = { time: { data: [0, 1] }, distance: { data: [0, 3] },
    heartrate: { data: [150, 152] }, velocity_smooth: { data: [2.6, 2.7] } };
  const s = mapStreams("strava:1", raw as any);
  assert.deepEqual(s.time, [0, 1]);
  assert.deepEqual(s.distance, [0, 3]);
  assert.deepEqual(s.heartRate, [150, 152]);
  assert.deepEqual(s.velocity, [2.6, 2.7]);
  assert.equal(s.watts, undefined);
});
