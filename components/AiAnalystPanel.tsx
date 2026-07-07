"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Dictionary } from "@/lib/i18n/dict";
import type { AiAnalystResult } from "@/lib/ai/types";

type AiLabels = Dictionary["ai"];

type AiAnalysisResponse =
  | {
      ok: true;
      mode: "gemini" | "local" | "fallback";
      configured: boolean;
      warning?: string;
      result: AiAnalystResult;
      snapshot: {
        runs: number;
        asOf: string;
        generatedAt: string;
      };
    }
  | { ok: false; error: string };

function providerLabel(labels: AiLabels, mode: "gemini" | "local" | "fallback"): string {
  if (mode === "gemini") return labels.gemini;
  if (mode === "fallback") return labels.fallback;
  return labels.local;
}

type AiAnalystContextValue = {
  labels: AiLabels;
  loading: boolean;
  error: string | null;
  analysis: Extract<AiAnalysisResponse, { ok: true }> | null;
  runAnalysis: () => Promise<void>;
};

const AiAnalystContext = createContext<AiAnalystContextValue | null>(null);

function useAiAnalyst(): AiAnalystContextValue {
  const context = useContext(AiAnalystContext);
  if (!context) throw new Error("AiAnalyst components must be rendered inside AiAnalystProvider.");
  return context;
}

export function AiAnalystProvider({ children, labels }: { children: ReactNode; labels: AiLabels }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Extract<AiAnalysisResponse, { ok: true }> | null>(null);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/analysis", { method: "POST" });
      const payload = (await response.json()) as AiAnalysisResponse;
      if (!response.ok || !payload.ok) {
        setError(labels.error);
        return;
      }
      setAnalysis(payload);
    } catch {
      setError(labels.error);
    } finally {
      setLoading(false);
    }
  }, [labels.error]);

  const value = useMemo(
    () => ({ labels, loading, error, analysis, runAnalysis }),
    [analysis, error, labels, loading, runAnalysis],
  );

  return <AiAnalystContext.Provider value={value}>{children}</AiAnalystContext.Provider>;
}

export function AiAnalystTopButton() {
  const { analysis, labels, loading, runAnalysis } = useAiAnalyst();

  return (
    <button className="btn ai-top-trigger" type="button" onClick={runAnalysis} disabled={loading}>
      {loading ? labels.loading : analysis ? labels.retry : labels.cta}
    </button>
  );
}

export default function AiAnalystPanel() {
  const { analysis, error, labels, loading } = useAiAnalyst();

  if (!loading && !error && !analysis) return null;

  return (
    <section className="ai-panel" aria-busy={loading} role="status" aria-live="polite">
      <div className="ai-panel-head">
        <div>
          <div className="label">{labels.kicker}</div>
          <h2>{labels.title}</h2>
          <p>{labels.subtitle}</p>
        </div>
      </div>

      {loading && !analysis && (
        <div className="ai-loading">
          <span />
          <span />
          <span />
        </div>
      )}

      {error && <div className="notice err" role="alert">{error}</div>}

      {analysis && (
        <div className={`ai-result${loading ? " is-reloading" : ""}`}>
          <div className="ai-result-main">
            <div className="ai-result-meta">
              <span className={`pill ${analysis.result.status === "recovery" ? "bad" : analysis.result.status === "ready" ? "good" : "warn"}`}>
                {labels.status[analysis.result.status]}
              </span>
              <span className="pill info">{providerLabel(labels, analysis.mode)}</span>
              <span className="mono muted">{labels.confidence[analysis.result.confidence]}</span>
            </div>
            <h3>{analysis.result.headline}</h3>
            <p>{analysis.result.summary}</p>
          </div>

          <div className="ai-next-session">
            <div className="label">{labels.nextSession}</div>
            <strong>{analysis.result.nextSession.prescription}</strong>
            <p><span>{labels.why}:</span> {analysis.result.nextSession.why}</p>
          </div>

          <div className="ai-grid">
            <div className="ai-block">
              <div className="label">{labels.mainLimiter}</div>
              <strong>{analysis.result.mainLimiter}</strong>
            </div>
            <div className="ai-block">
              <div className="label">{labels.watch}</div>
              <ul>
                {analysis.result.watch.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="ai-evidence">
            <div className="label">{labels.evidence}</div>
            <div className="ai-evidence-grid">
              {analysis.result.evidence.map((item, index) => (
                <div className="micro-stat" key={`${item.label}-${item.value}-${index}`}>
                  <div className="label">{item.label}</div>
                  <div className="value">{item.value}</div>
                  <div className="sub">{item.interpretation}</div>
                </div>
              ))}
            </div>
          </div>

          <p className="ai-caveat"><span>{labels.caveat}:</span> {analysis.result.caveat}</p>
          {analysis.warning && <p className="ai-warning">{analysis.warning}</p>}
        </div>
      )}
    </section>
  );
}
