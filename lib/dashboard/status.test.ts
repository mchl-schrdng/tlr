import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acwrPill,
  formCopy,
  median,
  signed,
  buildGreenPath,
  dashboardClock,
} from "@/lib/dashboard/status";
import { dictionaries } from "@/lib/i18n/dict";

const en = dictionaries.en;
const fr = dictionaries.fr;

test("acwrPill maps ratios to zones (localized text)", () => {
  assert.equal(acwrPill(en, null).text, en.dash.pill.calibrating);
  assert.equal(acwrPill(en, 1.0).cls, "good");
  assert.equal(acwrPill(en, 1.4).cls, "warn");
  assert.equal(acwrPill(en, 1.8).text, en.dash.pill.overload);
  assert.equal(acwrPill(fr, 1.8).text, fr.dash.pill.overload); // FR wired
  assert.equal(acwrPill(en, 0.6).text, en.dash.pill.low);
});

test("formCopy classifies the TSB bands", () => {
  assert.equal(formCopy(en, 15).label, en.dash.form.fresh.label);
  assert.equal(formCopy(en, -30).cls, "bad");
  assert.equal(formCopy(en, null).label, en.dash.form.calibrating.label);
});

test("median handles even and odd, empty", () => {
  assert.equal(median([]), null);
  assert.equal(median([5]), 5);
  assert.equal(median([1, 3]), 2);
  assert.equal(median([3, 1, 2]), 2);
});

test("signed formats sign and handles null", () => {
  assert.equal(signed(2.34), "+2.3");
  assert.equal(signed(-1), "-1.0");
  assert.equal(signed(null), "—");
});

test("buildGreenPath prescribes rest when load and fatigue are high", () => {
  const loads = Array.from({ length: 28 }, () => 80); // steady heavy load
  const gp = buildGreenPath(en, {
    dailyLoads: loads.map((load) => ({ load })),
    acwrRatio: 1.8,
    fitness: 60,
    fatigue: 110,
    form: -50,
    hardPattern: null,
    drift: 7,
    easyPace: "5:30/km",
  });
  assert.ok(gp.restDays != null && gp.restDays >= 1, `restDays ${gp.restDays}`);
  assert.ok(gp.action.length > 0);
});

test("dashboardClock uses real time when the latest run is in the past", () => {
  const clock = dashboardClock({ start_date: "2020-01-01T00:00:00Z" });
  assert.ok(clock.getTime() > new Date("2021-01-01").getTime());
});
