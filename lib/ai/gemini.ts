import { buildAnalystPrompt, AI_ANALYST_CONTENT_SCHEMA } from "./prompt";
import { normalizeAiAnalystContent, type AiAnalystResult, type TrainingSnapshot } from "./types";

const DEFAULT_MODEL = "gemini-3-flash-preview";
const DEFAULT_API_BASE = "https://generativelanguage.googleapis.com";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function jsonLike(text: string): boolean {
  const trimmed = stripJsonFence(text.trim());
  return trimmed.startsWith("{") && trimmed.includes('"headline"');
}

export function extractOutputText(payload: unknown): string | null {
  if (typeof payload === "string") {
    return jsonLike(payload) ? payload : null;
  }

  if (!isRecord(payload)) return null;

  const directKeys = ["output_text", "outputText", "text", "content"];
  for (const key of directKeys) {
    const value = payload[key];
    if (typeof value === "string" && jsonLike(value)) return value;
  }

  for (const value of Object.values(payload)) {
    if (typeof value === "string" && jsonLike(value)) return value;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = extractOutputText(item);
        if (found) return found;
      }
    } else if (isRecord(value)) {
      const found = extractOutputText(value);
      if (found) return found;
    }
  }

  return null;
}

export function buildGeminiEndpoint(model: string): string {
  const base = (process.env.GEMINI_API_BASE?.trim() || DEFAULT_API_BASE).replace(/\/+$/, "");
  return `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

export function buildGeminiRequestBody(prompt: string) {
  return {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: AI_ANALYST_CONTENT_SCHEMA,
    },
  };
}

export async function callGeminiAnalyst(snapshot: TrainingSnapshot): Promise<AiAnalystResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const endpoint = buildGeminiEndpoint(model);
  const prompt = buildAnalystPrompt(snapshot);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(buildGeminiRequestBody(prompt)),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${body.slice(0, 240)}`);
  }

  const payload = (await response.json()) as unknown;
  const outputText = extractOutputText(payload);
  if (!outputText) throw new Error("Gemini response did not include JSON output text.");

  const parsed = JSON.parse(stripJsonFence(outputText)) as unknown;
  const content = normalizeAiAnalystContent(parsed);

  return {
    version: 1,
    provider: "gemini",
    model,
    generatedAt: new Date().toISOString(),
    ...content,
  };
}
