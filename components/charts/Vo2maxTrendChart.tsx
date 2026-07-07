"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { VdotPoint } from "@/lib/metrics/fitnesstrend";

type Labels = {
  axis: string;
  low: string;
  current: string;
  best: string;
};

function pickTicks(labels: string[], max = 5): string[] {
  if (labels.length <= max) return labels;
  const out = new Set<string>();
  for (let i = 0; i < max; i++) {
    out.add(labels[Math.round((i * (labels.length - 1)) / (max - 1))]);
  }
  return [...out];
}

function yTicks(min: number, max: number): number[] {
  const span = Math.max(1, max - min);
  const step = span <= 6 ? 1 : span <= 12 ? 2 : 5;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end; v += step) ticks.push(v);
  return ticks.length >= 3 ? ticks : [start, Math.round((start + end) / 2), end];
}

export default function Vo2maxTrendChart({ points, labels }: { points: VdotPoint[]; labels: Labels }) {
  const data = points.map((p) => ({
    ...p,
    vo2max: Math.round(p.vo2max * 10) / 10,
    label: p.date.slice(5),
  }));
  const values = data.map((p) => p.vo2max).filter((v) => Number.isFinite(v));
  const yMin = values.length ? Math.max(0, Math.floor(Math.min(...values) - 2)) : 0;
  const yMax = values.length ? Math.ceil(Math.max(...values) + 2) : 60;
  const ticks = yTicks(yMin, yMax);
  const low = values.length ? Math.min(...values) : null;
  const current = values.length ? values[values.length - 1] : null;
  const best = values.length ? Math.max(...values) : null;
  const xTicks = pickTicks(data.map((p) => p.label), 5);

  return (
    <div className="vo2-chart-shell">
      <div className="chart-scale-row">
        <span>{labels.low} <b>{low != null ? low.toFixed(1) : "—"}</b></span>
        <span>{labels.current} <b>{current != null ? current.toFixed(1) : "—"}</b></span>
        <span>{labels.best} <b>{best != null ? best.toFixed(1) : "—"}</b></span>
      </div>
      <ResponsiveContainer width="100%" height={310}>
        <LineChart data={data} margin={{ top: 10, right: 18, left: 4, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 8" stroke="rgba(241,226,196,0.16)" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#a8a099"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            minTickGap={30}
            padding={{ left: 12, right: 18 }}
            ticks={xTicks}
          />
          <YAxis
            label={{ value: labels.axis, angle: -90, position: "insideLeft", fill: "#a8a099", fontSize: 10 }}
            stroke="#a8a099"
            tickLine={false}
            axisLine={false}
            width={46}
            fontSize={11}
            domain={[ticks[0], ticks[ticks.length - 1]]}
            ticks={ticks}
            tickFormatter={(v) => Number(v).toFixed(0)}
          />
          {current != null ? (
            <ReferenceLine y={current} stroke="rgba(216,255,79,0.26)" strokeDasharray="4 7" />
          ) : null}
          <Tooltip
            contentStyle={{ background: "rgba(13,15,15,0.94)", border: "1px solid rgba(241,226,196,0.18)", borderRadius: 8, color: "#f4f0e7" }}
            formatter={(v: number) => [Number(v).toFixed(1), labels.axis]}
            labelFormatter={(l) => `Date ${l}`}
          />
          <Line type="monotone" dataKey="vo2max" stroke="#f0d36b" strokeWidth={2.7} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
