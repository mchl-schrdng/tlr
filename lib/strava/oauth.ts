import { STRAVA_OAUTH_BASE, STRAVA_SCOPE } from "@/lib/config";
import { getSetting, saveToken } from "@/lib/db";

export type StravaCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

const KEY_ID = "strava_client_id";
const KEY_SECRET = "strava_client_secret";
const KEY_REDIRECT = "strava_redirect_uri";

// Cookie holding the OAuth `state` nonce between /authorize and the callback.
export const STRAVA_STATE_COOKIE = "strava_oauth_state";

// Resolve credentials from the local DB first (set via the UI), then fall back
// to environment variables. Returns null if any part is missing.
export function getStravaCredentials(): StravaCredentials | null {
  const clientId = getSetting(KEY_ID) ?? process.env.STRAVA_CLIENT_ID ?? "";
  const clientSecret = getSetting(KEY_SECRET) ?? process.env.STRAVA_CLIENT_SECRET ?? "";
  const redirectUri = getSetting(KEY_REDIRECT) ?? process.env.STRAVA_REDIRECT_URI ?? "";
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function isStravaConfigured(): boolean {
  return getStravaCredentials() !== null;
}

function requireCredentials(): StravaCredentials {
  const c = getStravaCredentials();
  if (!c) {
    throw new Error(
      "Strava credentials are not configured. Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET and STRAVA_REDIRECT_URI in .env.local.",
    );
  }
  return c;
}

export function authorizeUrl(state: string): string {
  const c = requireCredentials();
  const params = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: STRAVA_SCOPE,
    state,
  });
  return `${STRAVA_OAUTH_BASE}/authorize?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number };
};

// Exchange the one-time ?code from the callback for tokens, and persist them.
export async function exchangeCode(code: string): Promise<void> {
  const c = requireCredentials();
  const res = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava OAuth exchange failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as TokenResponse;
  saveToken({
    id: data.athlete?.id ?? 1,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    // Persist only non-secret athlete metadata — never duplicate the tokens
    // (already stored in their own columns) into raw_json.
    raw: data.athlete ? { athlete: data.athlete } : null,
  });
}
