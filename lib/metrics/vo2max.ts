// Estimate fitness (VDOT / VO2max-equivalent) and predict race times from a
// single best effort. Pure functions, no I/O.

// Daniels–Gilbert VDOT: VO2max-equivalent from a race performance.
// distanceM in metres, seconds the time. Returns VDOT in ml/kg/min.
export function estimateVdot(distanceM: number, seconds: number): number {
  const minutes = seconds / 60;
  if (minutes <= 0 || distanceM <= 0) return 0;
  const v = distanceM / minutes; // metres per minute
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pctMax =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * minutes) +
    0.2989558 * Math.exp(-0.1932605 * minutes);
  return pctMax > 0 ? vo2 / pctMax : 0;
}

// Riegel endurance model: T2 = T1 * (D2/D1)^1.06.
export function predictTime(refDistanceM: number, refSeconds: number, targetM: number): number {
  if (refDistanceM <= 0) return 0;
  return refSeconds * Math.pow(targetM / refDistanceM, 1.06);
}

const RACE_DISTANCES: { label: string; m: number }[] = [
  { label: "5K", m: 5000 },
  { label: "10K", m: 10000 },
  { label: "Half", m: 21097.5 },
  { label: "Marathon", m: 42195 },
];

export type RacePrediction = { label: string; distanceM: number; seconds: number };

export function racePredictions(refDistanceM: number, refSeconds: number): RacePrediction[] {
  return RACE_DISTANCES.map((d) => ({
    label: d.label,
    distanceM: d.m,
    seconds: predictTime(refDistanceM, refSeconds, d.m),
  }));
}
