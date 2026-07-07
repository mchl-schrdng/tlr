"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WeeklyZoneDistribution } from "@/lib/metrics/dashboard";

const ZONES = [
  { key: "z1", name: "Z1", color: "#54d273" },
  { key: "z2", name: "Z2", color: "#61b3ff" },
  { key: "z3", name: "Z3", color: "#f0d36b" },
  { key: "z4", name: "Z4", color: "#ff8a3d" },
  { key: "z5", name: "Z5", color: "#ff5d52" },
];

export default function ZoneStackChart({ weeks }: { weeks: WeeklyZoneDistribution[] }) {
  const data = weeks.map((w) => ({
    ...w,
    label: w.weekStart.slice(5),
  }));
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 8" stroke="rgba(241,226,196,0.12)" vertical={false} />
        <XAxis dataKey="label" stroke="#a8a099" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis
          stroke="#a8a099"
          tickLine={false}
          axisLine={false}
          width={36}
          fontSize={11}
          domain={[0, 100]}
          tickFormatter={(v) => `${Math.round(Number(v))}%`}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,77,0,0.08)" }}
          contentStyle={{ background: "rgba(13,15,15,0.94)", border: "1px solid rgba(241,226,196,0.18)", borderRadius: 14, color: "#f4f0e7" }}
          formatter={(v: number, name: string) => [`${Number(v).toFixed(1)}%`, name.toUpperCase()]}
          labelFormatter={(l) => `Week of ${l}`}
        />
        {ZONES.map((zone) => (
          <Bar
            key={zone.key}
            dataKey={zone.key}
            stackId="zones"
            fill={zone.color}
            radius={zone.key === "z5" ? [8, 8, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
