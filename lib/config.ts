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

// Aerobic-efficiency trajectory ("are you getting fitter?"). We compare pace-at-HR
// (efficiency factor) over a recent window against the window before it.
// Only runs whose average HR sits in the aerobic band are compared, so we track
// like-for-like easy/steady efforts rather than mixing in hard sessions.
export const AEROBIC_HR_MIN_FRAC = 0.65; // × HR_MAX — lower edge of the aerobic band
export const AEROBIC_HR_MAX_FRAC = 0.85; // × HR_MAX — upper edge of the aerobic band
export const EFFICIENCY_WINDOW_DAYS = 42; // length of each comparison window
export const EFFICIENCY_MIN_SAMPLES = 3; // eligible aerobic runs required per window
export const EFFICIENCY_TREND_MIN_PCT = 2; // |EF change| below this reads as flat/noise
// Only compare like-for-like terrain: pace-at-HR on a hill or trail is far slower
// than on flat ground for the same fitness, so runs climbing more than this many
// metres per km are excluded (as are treadmill runs and runs with no elevation data).
export const EFFICIENCY_FLAT_MAX_GAIN_PER_KM = 12;

export const STRAVA_SCOPE = "activity:read_all";
export const STRAVA_API_BASE = "https://www.strava.com/api/v3";
export const STRAVA_OAUTH_BASE = "https://www.strava.com/oauth";
