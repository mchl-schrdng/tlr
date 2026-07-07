"use client";

import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { fmtPaceFromSecPerKm } from "@/lib/format";
import type { PaceHrPoint } from "@/lib/metrics/dashboard";

export default function PaceHrScatterChart({ points }: { points: PaceHrPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={270}>
      <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 8" stroke="rgba(241,226,196,0.12)" />
        <XAxis
          type="number"
          dataKey="paceSecPerKm"
          name="Pace"
          reversed
          domain={[150, 900]}
          stroke="#a8a099"
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => fmtPaceFromSecPerKm(Number(v)).replace(" /km", "")}
          fontSize={11}
        />
        <YAxis
          type="number"
          dataKey="hr"
          name="HR"
          stroke="#a8a099"
          tickLine={false}
          axisLine={false}
          domain={["dataMin - 8", "dataMax + 8"]}
          tickFormatter={(v) => `${Math.round(Number(v))}`}
          fontSize={11}
          width={34}
        />
        <ZAxis type="number" dataKey="load" range={[48, 260]} />
        <Tooltip
          cursor={{ stroke: "rgba(240,211,107,0.35)", strokeDasharray: "3 5" }}
          contentStyle={{ background: "rgba(13,15,15,0.94)", border: "1px solid rgba(241,226,196,0.18)", borderRadius: 14, color: "#f4f0e7" }}
          formatter={(value: number, name: string) => {
            if (name === "Pace") return [fmtPaceFromSecPerKm(value), name];
            if (name === "HR") return [`${Math.round(value)} bpm`, name];
            return [Math.round(value), "Load"];
          }}
          labelFormatter={() => ""}
        />
        <Scatter data={points} fill="#61b3ff" fillOpacity={0.72} stroke="#f4f0e7" strokeOpacity={0.28} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
