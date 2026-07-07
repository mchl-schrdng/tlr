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
import type { WeeklyLongRun } from "@/lib/metrics/dashboard";

export default function LongRunTrendChart({ weeks }: { weeks: WeeklyLongRun[] }) {
  const data = weeks.map((w) => ({
    ...w,
    label: w.weekStart.slice(5),
    km: Math.round(w.km * 10) / 10,
    longKm: Math.round(w.longKm * 10) / 10,
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 8" stroke="rgba(245,241,232,0.12)" vertical={false} />
        <XAxis dataKey="label" stroke="#a29c91" tickLine={false} axisLine={false} fontSize={11} minTickGap={16} />
        <YAxis
          stroke="#a29c91"
          tickLine={false}
          axisLine={false}
          width={36}
          fontSize={11}
          tickFormatter={(v) => `${Math.round(Number(v))}`}
        />
        <Tooltip
          contentStyle={{
            background: "rgba(8,9,8,0.96)",
            border: "1px solid rgba(238,232,216,0.18)",
            borderRadius: 8,
            color: "#f5f1e8",
          }}
          formatter={(value: number, name: string) => [
            `${Number(value).toFixed(1)} km`,
            name === "longKm" ? "Longest run" : "Weekly volume",
          ]}
          labelFormatter={(l) => `Week ${l}`}
        />
        <Bar dataKey="km" fill="rgba(245,241,232,0.12)" radius={[4, 4, 0, 0]} />
        <Line
          type="monotone"
          dataKey="longKm"
          stroke="#d8ff4f"
          strokeWidth={2.8}
          dot={{ r: 2.5, fill: "#050504", stroke: "#d8ff4f", strokeWidth: 2 }}
          activeDot={{ r: 5, fill: "#050504", stroke: "#d8ff4f", strokeWidth: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
