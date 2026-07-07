import assert from "node:assert/strict";
import test from "node:test";
import { buildGeminiEndpoint, buildGeminiRequestBody, extractOutputText } from "./gemini";

test("extractOutputText reads direct Interactions output_text", () => {
  const text = JSON.stringify({ headline: "Ready", summary: "Clean signal" });

  assert.equal(
    extractOutputText({
      output_text: text,
    }),
    text,
  );
});

test("extractOutputText searches nested response parts", () => {
  const text = JSON.stringify({ headline: "Careful", summary: "Load is high" });

  assert.equal(
    extractOutputText({
      output: [
        {
          content: [
            {
              text,
            },
          ],
        },
      ],
    }),
    text,
  );
});

test("extractOutputText ignores non-json chatter", () => {
  assert.equal(extractOutputText({ output_text: "hello" }), null);
});

test("extractOutputText reads Gemini candidates and fenced JSON", () => {
  const text = JSON.stringify({ headline: "Ready", summary: "Clean signal" });
  const fenced = "```json\n" + text + "\n```";

  assert.equal(
    extractOutputText({ candidates: [{ content: { parts: [{ text: fenced }] } }] }),
    fenced,
  );
});

test("buildGeminiEndpoint targets the real generateContent route", () => {
  const previous = process.env.GEMINI_API_BASE;
  delete process.env.GEMINI_API_BASE;
  assert.equal(
    buildGeminiEndpoint("gemini-3-flash-preview"),
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
  );

  process.env.GEMINI_API_BASE = "https://proxy.example.com/";
  assert.equal(
    buildGeminiEndpoint("gemini-3-flash-preview"),
    "https://proxy.example.com/v1beta/models/gemini-3-flash-preview:generateContent",
  );

  if (previous === undefined) delete process.env.GEMINI_API_BASE;
  else process.env.GEMINI_API_BASE = previous;
});

test("buildGeminiRequestBody uses Gemini's contents + generationConfig shape", () => {
  const body = buildGeminiRequestBody("PROMPT");

  assert.equal(body.contents[0].parts[0].text, "PROMPT");
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.ok(body.generationConfig.responseSchema);
});

