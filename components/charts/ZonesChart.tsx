"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ZoneTime } from "@/lib/metrics/perRun";
import { fmtDuration } from "@/lib/format";

const ZONE_COLORS = ["#54d273", "#61b3ff", "#f0d36b", "#ff8a3d", "#ff5d52"];

export default function ZonesChart({ zones }: { zones: ZoneTime[] }) {
  const data = zones.map((z) => ({ ...z, minutes: z.seconds / 60 }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          stroke="#a8a099"
          tickLine={false}
          axisLine={false}
          width={96}
          fontSize={12}
        />
        <Tooltip
          cursor={{ fill: "rgba(241,226,196,0.05)" }}
          contentStyle={{ background: "rgba(13,15,15,0.94)", border: "1px solid rgba(241,226,196,0.18)", borderRadius: 14, color: "#f4f0e7" }}
          formatter={(_v: number, _n, p: { payload?: { seconds: number } }) => [
            fmtDuration(p.payload?.seconds ?? 0),
            "Time",
          ]}
        />
        <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={ZONE_COLORS[i]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
