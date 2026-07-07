"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FitnessPoint } from "@/lib/metrics/dashboard";

export default function FitnessFatigueChart({ points }: { points: FitnessPoint[] }) {
  const data = points.map((p) => ({
    ...p,
    label: p.date.slice(5),
  }));
  return (
    <ResponsiveContainer width="100%" height={310}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 8" stroke="rgba(241,226,196,0.12)" vertical={false} />
        <XAxis dataKey="label" stroke="#a8a099" tickLine={false} axisLine={false} fontSize={11} minTickGap={22} />
        <YAxis
          stroke="#a8a099"
          tickLine={false}
          axisLine={false}
          width={38}
          fontSize={11}
          tickFormatter={(v) => Number(v).toFixed(0)}
        />
        <Tooltip
          contentStyle={{ background: "rgba(13,15,15,0.94)", border: "1px solid rgba(241,226,196,0.18)", borderRadius: 14, color: "#f4f0e7" }}
          formatter={(v: number, name: string) => {
            const labels: Record<string, string> = {
              fitness: "Fitness",
              fatigue: "Fatigue",
              form: "Form",
              load: "Daily load",
            };
            return [Number(v).toFixed(1), labels[name] ?? name];
          }}
          labelFormatter={(l) => `Date ${l}`}
        />
        <Area type="monotone" dataKey="load" fill="#ff4d00" fillOpacity={0.12} stroke="transparent" />
        <Line type="monotone" dataKey="fitness" stroke="#f0d36b" strokeWidth={2.7} dot={false} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="fatigue" stroke="#ff4d00" strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="form" stroke="#61b3ff" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
