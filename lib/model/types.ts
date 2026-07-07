export type Sport = "run" | "trail_run" | "virtual_run" | "ride" | "other";

export interface Activity {
  id: string;            // "strava:19167485894"
  source: string;        // "strava"
  sport: Sport;
  name: string;
  startTime: string;     // ISO 8601
  distanceM: number;
  movingTimeS: number;
  elapsedTimeS: number;
  elevationGainM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgSpeedMps: number | null;
  avgCadence: number | null;
  avgWatts: number | null;
  relativeEffort: number | null;   // Strava suffer_score
  gearId: string | null;           // "strava:7221065" | null
  isTrainer: boolean;
}

export interface Stream {
  activityId: string;
  time: number[];
  distance: number[];
  heartRate?: number[];
  velocity?: number[];
  altitude?: number[];
  cadence?: number[];
  watts?: number[];
  temp?: number[];
  grade?: number[];
}

export interface Gear {
  id: string;                       // "strava:7221065"
  type: "shoe" | "bike";
  name: string;
  distanceM: number;
  retired: boolean;
}

export interface Zones {
  hr: { min: number; max: number | null }[];
  hrSource: string;
  power?: { min: number; max: number | null }[];
  ftp?: number | null;
  ftpEstimated?: boolean;
  pace?: { min: number; max: number | null }[];   // m/s bounds (MCP-only, null in REST)
  paceSource?: string;
}

export interface Athlete {
  id: string;
  name: string;
  gender: string | null;
  weightKg: number | null;
  focus: string | null;             // MCP-only, null in REST Phase 0
}
