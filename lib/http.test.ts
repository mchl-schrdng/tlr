import assert from "node:assert/strict";
import test from "node:test";
import { isSameOrigin } from "./http";

function reqWith(headers: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/sync", { method: "POST", headers });
}

test("isSameOrigin allows a matching origin/host", () => {
  assert.equal(isSameOrigin(reqWith({ origin: "http://localhost:3000", host: "localhost:3000" })), true);
});

test("isSameOrigin allows requests without an Origin header", () => {
  assert.equal(isSameOrigin(reqWith({ host: "localhost:3000" })), true);
});

test("isSameOrigin rejects a cross-site origin", () => {
  assert.equal(isSameOrigin(reqWith({ origin: "https://evil.example.com", host: "localhost:3000" })), false);
});

test("isSameOrigin rejects a malformed origin", () => {
  assert.equal(isSameOrigin(reqWith({ origin: "not-a-url", host: "localhost:3000" })), false);
});
