import type { StreamSet } from "@/lib/db";
import { HR_MAX, REST_HR } from "@/lib/config";

// Banister TRIMP (training impulse) from a heart-rate stream.
//
// For each time segment: minutes * HRr * 0.64 * e^(1.92 * HRr)
// where HRr = (HR - restHr) / (maxHr - restHr) is the heart-rate reserve fraction,
// clamped to [0, 1]. The 0.64 / 1.92 coefficients are Banister's male constants.
//
// TRIMP is intensity-weighted, so it separates an easy hour from a hard hour the
// way raw minutes cannot — the physiologically correct input for CTL/ATL/TSB.
// Returns null when the stream has no usable time + heart-rate data.
export function trimp(stream: StreamSet, restHr = REST_HR, maxHr = HR_MAX): number | null {
  const time = stream.time;
  const hr = stream.heartrate;
  if (!time || !hr || time.length < 2) return null;
  const reserve = maxHr - restHr;
  if (reserve <= 0) return null;

  let sum = 0;
  let counted = 0;
  for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1];
    if (dt <= 0) continue; // clock glitch
    if (hr[i] == null || hr[i - 1] == null) continue;
    const h = (hr[i] + hr[i - 1]) / 2;
    let hrr = (h - restHr) / reserve;
    if (hrr < 0) hrr = 0;
    if (hrr > 1) hrr = 1;
    const minutes = dt / 60;
    sum += minutes * hrr * 0.64 * Math.exp(1.92 * hrr);
    counted++;
  }
  return counted > 0 ? sum : null;
}
