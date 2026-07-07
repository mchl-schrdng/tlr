// User-tunable configuration. Adjust to your physiology.

// Max heart rate. Used to derive HR zones. Default: rough 220 - age estimate;
// override with your measured max if you know it.
export const HR_MAX = 190;

// 5 classic HR zones as fractions of HR_MAX (lower bound of each zone).
// Zone i covers [ZONE_BOUNDS[i], ZONE_BOUNDS[i+1]) * HR_MAX.
export const ZONE_BOUNDS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.01];
export const ZONE_LABELS = ["Z1 recovery", "Z2 endurance", "Z3 tempo", "Z4 threshold", "Z5 VO2max"];

// Resting HR (bpm). Used with HR_MAX to compute heart-rate reserve for TRIMP load.
export const REST_HR = 50;

// ACWR (acute:chronic workload ratio) healthy window.
export const ACWR_LOW = 0.8;
export const ACWR_HIGH = 1.3;
export const ACWR_DANGER = 1.5;

// Aerobic decoupling threshold (%) above which endurance base is flagged.
export const DECOUPLING_THRESHOLD = 5;

export const STRAVA_SCOPE = "activity:read_all";
export const STRAVA_API_BASE = "https://www.strava.com/api/v3";
export const STRAVA_OAUTH_BASE = "https://www.strava.com/oauth";
