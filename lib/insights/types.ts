type Severity = "good" | "info" | "warn" | "bad";

// A single piece of evidence behind an insight — an activity or a derived metric.
// `ref` links to the underlying record when one exists.
export interface Evidence {
  kind: "activity" | "metric";
  ref?: string;
  label: string;
  value?: string;
}

// A deterministic, proof-backed insight. `message` and every number are computed
// (never from an LLM); `evidence` is the exact data the conclusion rests on, so
// the UI can show it and a future AI layer can cite it without inventing figures.
export interface Insight {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  metric?: { label: string; value: string };
  action: string;
  evidence: Evidence[];
  formula?: string;
}
