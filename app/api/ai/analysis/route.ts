import { NextResponse } from "next/server";
import { getToken } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { buildTrainingSnapshot } from "@/lib/ai/snapshot";
import { buildLocalAnalyst } from "@/lib/ai/fallback";
import { callGeminiAnalyst, isGeminiConfigured } from "@/lib/ai/gemini";
import { isSameOrigin } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!getToken()) {
    return NextResponse.json({ ok: false, error: "not_connected" }, { status: 401 });
  }

  const { locale, t } = await getT();
  const snapshot = buildTrainingSnapshot(t, locale);
  const configured = isGeminiConfigured();

  if (!configured) {
    return NextResponse.json({
      ok: true,
      mode: "local",
      configured,
      result: buildLocalAnalyst(t, snapshot, "missing_gemini_key"),
      snapshot: {
        runs: snapshot.history.runs,
        asOf: snapshot.asOf,
        generatedAt: snapshot.generatedAt,
      },
    });
  }

  try {
    const result = await callGeminiAnalyst(snapshot);
    return NextResponse.json({
      ok: true,
      mode: "gemini",
      configured,
      result,
      snapshot: {
        runs: snapshot.history.runs,
        asOf: snapshot.asOf,
        generatedAt: snapshot.generatedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Gemini error";
    return NextResponse.json({
      ok: true,
      mode: "fallback",
      configured,
      warning: message.slice(0, 240),
      result: buildLocalAnalyst(t, snapshot, "gemini_fallback"),
      snapshot: {
        runs: snapshot.history.runs,
        asOf: snapshot.asOf,
        generatedAt: snapshot.generatedAt,
      },
    });
  }
}

