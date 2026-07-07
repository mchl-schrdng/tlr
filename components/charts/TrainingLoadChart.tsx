"use client";

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
import type { WeeklyLoad } from "@/lib/metrics/dashboard";

export default function TrainingLoadChart({ weeks }: { weeks: WeeklyLoad[] }) {
  const data = weeks.map((w) => ({
    label: w.weekStart.slice(5),
    km: Math.round(w.km * 10) / 10,
    load: Math.round(w.load),
    count: w.count,
  }));
  return (
    <ResponsiveContainer width="100%" height={270}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 8" stroke="rgba(241,226,196,0.12)" vertical={false} />
        <XAxis dataKey="label" stroke="#a8a099" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis yAxisId="load" stroke="#a8a099" tickLine={false} axisLine={false} width={38} fontSize={12} tickFormatter={(v) => `${Math.round(Number(v))}`} />
        <YAxis yAxisId="km" orientation="right" stroke="#a8a099" tickLine={false} axisLine={false} width={34} fontSize={12} tickFormatter={(v) => `${Math.round(Number(v))}`} />
        <Tooltip
          cursor={{ fill: "rgba(255,77,0,0.08)" }}
          contentStyle={{ background: "rgba(13,15,15,0.94)", border: "1px solid rgba(241,226,196,0.18)", borderRadius: 14, color: "#f4f0e7" }}
          formatter={(v: number, name: string) =>
            name === "km" ? [v + " km", "Distance"] : name === "count" ? [v, "Runs"] : [v, "Load"]
          }
          labelFormatter={(l) => `Week of ${l}`}
        />
        <Bar yAxisId="load" dataKey="load" fill="#ff4d00" radius={[8, 8, 0, 0]} opacity={0.75} />
        <Line yAxisId="km" type="monotone" dataKey="km" stroke="#f0d36b" strokeWidth={2.5} dot={{ r: 3, fill: "#f0d36b" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
