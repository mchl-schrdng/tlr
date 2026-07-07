"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Split } from "@/lib/metrics/perRun";

function mmss(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SplitsChart({ splits }: { splits: Split[] }) {
  const data = splits.map((s) => ({
    km: s.km,
    pace: Math.round(s.paceSecPerKm),
    hr: s.avgHr ? Math.round(s.avgHr) : null,
  }));
  const paces = data.map((d) => d.pace);
  const min = Math.min(...paces);
  const max = Math.max(...paces);
  const pad = Math.max(10, (max - min) * 0.15);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 8" stroke="rgba(241,226,196,0.12)" vertical={false} />
        <XAxis dataKey="km" stroke="#a8a099" tickLine={false} axisLine={false} unit=" km" fontSize={12} />
        <YAxis
          stroke="#a8a099"
          tickLine={false}
          axisLine={false}
          domain={[Math.max(0, min - pad), max + pad]}
          reversed
          tickFormatter={(v) => mmss(v)}
          width={44}
          fontSize={12}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,77,0,0.08)" }}
          contentStyle={{ background: "rgba(13,15,15,0.94)", border: "1px solid rgba(241,226,196,0.18)", borderRadius: 14, color: "#f4f0e7" }}
          formatter={(value: number, name: string) =>
            name === "pace" ? [mmss(value) + " /km", "Pace"] : [value + " bpm", "HR"]
          }
          labelFormatter={(km) => `Km ${km}`}
        />
        <Bar dataKey="pace" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.pace === min ? "#f0d36b" : "#ff4d00"} opacity={d.pace === min ? 1 : 0.62} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
