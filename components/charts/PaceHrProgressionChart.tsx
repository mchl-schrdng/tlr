"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LongTermProgressionPoint } from "@/lib/metrics/dashboard";

function formatPace(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const rounded = Math.round(seconds);
  const m = Math.floor(rounded / 60);
  const s = String(rounded % 60).padStart(2, "0");
  return `${m}:${s} /km`;
}

function shortLabel(period: string): string {
  return period.replace("20", "'");
}

type Mode = "quarter" | "year";

export default function PaceHrProgressionChart({
  quarterly,
  yearly,
}: {
  quarterly: LongTermProgressionPoint[];
  yearly: LongTermProgressionPoint[];
}) {
  const [mode, setMode] = useState<Mode>("quarter");
  const source = mode === "quarter" ? quarterly : yearly;
  const data = useMemo(
    () =>
      source.map((p) => ({
        period: p.period,
        label: shortLabel(p.period),
        runs: p.count,
        km: Math.round(p.km * 10) / 10,
        avgHr: p.avgHr != null ? Math.round(p.avgHr) : null,
        paceSecPerKm: p.paceSecPerKm != null ? Math.round(p.paceSecPerKm) : null,
      })),
    [source],
  );

  return (
    <div>
      <div className="chart-toggle" role="group" aria-label="Progression grouping">
        <button className={mode === "quarter" ? "active" : ""} onClick={() => setMode("quarter")} type="button">
          Quarter
        </button>
        <button className={mode === "year" ? "active" : ""} onClick={() => setMode("year")} type="button">
          Year
        </button>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 8" stroke="rgba(245,241,232,0.12)" vertical={false} />
          <XAxis dataKey="label" stroke="#a29c91" tickLine={false} axisLine={false} fontSize={11} minTickGap={18} />
          <YAxis
            yAxisId="volume"
            hide
            dataKey="km"
            domain={[0, "dataMax + 10"]}
          />
          <YAxis
            yAxisId="hr"
            stroke="#ff4f12"
            tickLine={false}
            axisLine={false}
            width={38}
            fontSize={11}
            domain={["dataMin - 5", "dataMax + 5"]}
            tickFormatter={(v) => `${Math.round(Number(v))}`}
          />
          <YAxis
            yAxisId="pace"
            orientation="right"
            reversed
            stroke="#d8ff4f"
            tickLine={false}
            axisLine={false}
            width={54}
            fontSize={11}
            domain={["dataMin - 20", "dataMax + 20"]}
            tickFormatter={(v) => formatPace(Number(v)).replace(" /km", "")}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(8,9,8,0.96)",
              border: "1px solid rgba(238,232,216,0.18)",
              borderRadius: 8,
              color: "#f5f1e8",
            }}
            formatter={(value: number, name: string) => {
              if (name === "avgHr") return [`${Math.round(value)} bpm`, "Avg HR"];
              if (name === "paceSecPerKm") return [formatPace(value), "Avg pace"];
              if (name === "km") return [`${Number(value).toFixed(1)} km`, "Distance"];
              return [String(value), name];
            }}
            labelFormatter={(_, payload) => {
              const first = payload?.[0]?.payload as { period?: string; runs?: number } | undefined;
              return first ? `${first.period} · ${first.runs} runs` : "";
            }}
          />
          <Bar yAxisId="volume" dataKey="km" fill="rgba(245,241,232,0.10)" radius={[4, 4, 0, 0]} />
          <Line
            yAxisId="hr"
            type="monotone"
            dataKey="avgHr"
            stroke="#ff4f12"
            strokeWidth={2.8}
            dot={false}
            activeDot={{ r: 4, fill: "#f5f1e8", stroke: "#ff4f12", strokeWidth: 2 }}
            connectNulls
          />
          <Line
            yAxisId="pace"
            type="monotone"
            dataKey="paceSecPerKm"
            stroke="#d8ff4f"
            strokeWidth={2.8}
            dot={false}
            activeDot={{ r: 4, fill: "#050504", stroke: "#d8ff4f", strokeWidth: 2 }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        <span><i className="swatch orange" />Avg HR</span>
        <span><i className="swatch acid" />Avg pace</span>
        <span><i className="swatch volume" />Distance volume</span>
      </div>
    </div>
  );
}
