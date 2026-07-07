import type { Activity, Athlete, Gear, Sport, Stream, Zones } from "@/lib/model/types";

const NS = "strava";
const nsId = (id: string | number) => `${NS}:${id}`;

const SPORT_MAP: Record<string, Sport> = {
  Run: "run", TrailRun: "trail_run", VirtualRun: "virtual_run", Ride: "ride",
  VirtualRide: "ride", GravelRide: "ride", MountainBikeRide: "ride",
};
function toSport(raw: { sport_type?: string; type?: string }): Sport {
  return SPORT_MAP[raw.sport_type ?? raw.type ?? ""] ?? "other";
}

// Strava uses -1 (or a huge number) as the open upper bound of the last zone.
const cap = (max: number) => (max < 0 ? null : max);

export function mapActivity(raw: any): Activity {
  return {
    id: nsId(raw.id),
    source: NS,
    sport: toSport(raw),
    name: raw.name ?? "",
    startTime: new Date(raw.start_date).toISOString(),
    distanceM: raw.distance ?? 0,
    movingTimeS: raw.moving_time ?? 0,
    elapsedTimeS: raw.elapsed_time ?? 0,
    elevationGainM: raw.total_elevation_gain ?? null,
    avgHr: raw.average_heartrate ?? null,
    maxHr: raw.max_heartrate ?? null,
    avgSpeedMps: raw.average_speed ?? null,
    avgCadence: raw.average_cadence ?? null,
    avgWatts: raw.average_watts ?? null,
    relativeEffort: raw.suffer_score ?? null,
    gearId: raw.gear_id ? nsId(raw.gear_id) : null,
    isTrainer: !!raw.trainer,
  };
}

export function mapGearFromAthlete(raw: any): Gear[] {
  const bikes = (raw.bikes ?? []).map((b: any): Gear => ({
    id: nsId(b.id), type: "bike", name: b.name ?? "Bike",
    distanceM: b.distance ?? 0, retired: !!b.retired,
  }));
  const shoes = (raw.shoes ?? []).map((s: any): Gear => ({
    id: nsId(s.id), type: "shoe", name: s.name ?? "Chaussures",
    distanceM: s.distance ?? 0, retired: !!s.retired,
  }));
  return [...bikes, ...shoes];
}

export function mapZones(rawZones: any, athlete: any): Zones {
  const hr = (rawZones?.heart_rate?.zones ?? []).map((z: any) => ({
    min: z.min, max: cap(z.max),
  }));
  const power = rawZones?.power?.zones
    ? rawZones.power.zones.map((z: any) => ({ min: z.min, max: cap(z.max) }))
    : undefined;
  return {
    hr,
    hrSource: rawZones?.heart_rate?.custom_zones ? "Custom" : "Default",
    power,
    ftp: athlete?.ftp ?? null,
    ftpEstimated: true,
  };
}

export function mapAthlete(raw: any): Athlete {
  const name = [raw.firstname, raw.lastname].filter(Boolean).join(" ").trim();
  return {
    id: nsId(raw.id),
    name: name || "Athlete",
    gender: raw.sex ?? null,
    weightKg: raw.weight ?? null,
    focus: null, // MCP-only; not in REST
  };
}

const STREAM_RENAME: Record<string, keyof Stream> = {
  time: "time", distance: "distance", heartrate: "heartRate",
  velocity_smooth: "velocity", altitude: "altitude", cadence: "cadence",
  watts: "watts", temp: "temp", grade_smooth: "grade",
};
export function mapStreams(activityId: string, raw: any): Stream {
  const out: Stream = { activityId, time: [], distance: [] };
  for (const [rawKey, modelKey] of Object.entries(STREAM_RENAME)) {
    const data = raw?.[rawKey]?.data;
    if (Array.isArray(data)) (out as any)[modelKey] = data;
  }
  return out;
}
