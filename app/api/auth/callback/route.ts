import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, STRAVA_STATE_COOKIE } from "@/lib/strava/oauth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = req.cookies.get(STRAVA_STATE_COOKIE)?.value;

  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/?error=${encodeURIComponent(reason)}`, url.origin));
    res.cookies.delete(STRAVA_STATE_COOKIE);
    return res;
  };

  if (error) return fail(error);
  if (!code) return fail("missing_code");
  // Reject callbacks whose state doesn't match the cookie we set — this blocks
  // login CSRF (an attacker forcing their own code into the session).
  if (!state || !expectedState || state !== expectedState) return fail("invalid_state");

  try {
    await exchangeCode(code);
    const res = NextResponse.redirect(new URL(`/?connected=1`, url.origin));
    res.cookies.delete(STRAVA_STATE_COOKIE);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "oauth_failed";
    return fail(msg);
  }
}
