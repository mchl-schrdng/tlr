import { STRAVA_API_BASE, STRAVA_OAUTH_BASE } from "@/lib/config";
import { getToken, saveToken, type StreamSet } from "@/lib/db";
import { getStravaCredentials } from "@/lib/strava/oauth";

export class NotConnectedError extends Error {
  constructor() {
    super("Strava account is not connected. Click \"Connect Strava\".");
  }
}

// Returns a valid access token, refreshing transparently if it expires within 60s.
async function getValidAccessToken(): Promise<string> {
  const token = getToken();
  if (!token) throw new NotConnectedError();

  const now = Math.floor(Date.now() / 1000);
  if (token.expires_at - now > 60) return token.access_token;

  const creds = getStravaCredentials();
  if (!creds) throw new NotConnectedError();
  const res = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava token refresh failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
  saveToken({
    id: token.id,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  });
  return data.access_token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// GET a Strava API path with auth + one retry on 429 (rate limit) using Retry-After.
async function apiGet(path: string): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const accessToken = await getValidAccessToken();
    const res = await fetch(`${STRAVA_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 429 && attempt === 0) {
      const retryAfter = Number(res.headers.get("retry-after")) || 900;
      await sleep(Math.min(retryAfter, 60) * 1000);
      continue;
    }
    return res;
  }
  throw new Error("Strava rate limit reached (429). Try again in a few minutes.");
}

export type SummaryActivity = {
  id: number;
  name: string;
  start_date: string;
  type: string;
  sport_type?: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  average_heartrate?: number;
  max_heartrate?: number;
  total_elevation_gain?: number;
  average_cadence?: number;
  average_speed?: number;
  suffer_score?: number;
};

// Fetch summary activities, page by page, until `after` (unix seconds) or exhausted.
export async function fetchActivities(afterEpoch?: number): Promise<SummaryActivity[]> {
  const all: SummaryActivity[] = [];
  const perPage = 200;
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({ per_page: String(perPage), page: String(page) });
    if (afterEpoch) q.set("after", String(afterEpoch));
    const res = await apiGet(`/athlete/activities?${q.toString()}`);
    if (!res.ok) throw new Error(`Strava /athlete/activities ${res.status}: ${await res.text()}`);
    const batch = (await res.json()) as SummaryActivity[];
    all.push(...batch);
    if (batch.length < perPage) break;
  }
  return all;
}

const STREAM_KEYS = "time,distance,heartrate,velocity_smooth,altitude,cadence,temp";

// Fetch time-series streams for one activity. Returns null if none available.
export async function fetchStreams(activityId: number): Promise<StreamSet | null> {
  const res = await apiGet(
    `/activities/${activityId}/streams?keys=${STREAM_KEYS}&key_by_type=true`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Strava streams ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as Record<string, { data: number[] }>;
  const out: StreamSet = {};
  for (const key of STREAM_KEYS.split(",")) {
    if (data[key]?.data) (out as Record<string, number[]>)[key] = data[key].data;
  }
  return out;
}

// Raw athlete profile (includes bikes, shoes, ftp, weight, sex) — mapped by providers/strava/map.
export async function fetchAthleteRaw(): Promise<unknown> {
  const res = await apiGet(`/athlete`);
  if (!res.ok) throw new Error(`Strava /athlete ${res.status}: ${await res.text()}`);
  return res.json();
}

// Raw heart-rate / power zone boundaries — mapped by providers/strava/map.
export async function fetchZonesRaw(): Promise<unknown> {
  const res = await apiGet(`/athlete/zones`);
  if (!res.ok) throw new Error(`Strava /athlete/zones ${res.status}: ${await res.text()}`);
  return res.json();
}
