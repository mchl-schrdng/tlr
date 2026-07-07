import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtPaceFromSecPerKm, fmtPaceFromSpeed } from "@/lib/format";

test("fmtPaceFromSecPerKm: carries rounded seconds into minutes", () => {
  assert.equal(fmtPaceFromSecPerKm(599.6), "10:00 /km");
  assert.equal(fmtPaceFromSecPerKm(359.4), "5:59 /km");
});

test("fmtPaceFromSpeed: handles invalid and valid speeds", () => {
  assert.equal(fmtPaceFromSpeed(0), "—");
  assert.equal(fmtPaceFromSpeed(null), "—");
  assert.equal(fmtPaceFromSpeed(1000 / 300), "5:00 /km");
});
