import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeUrl, isStravaConfigured, STRAVA_STATE_COOKIE } from "@/lib/strava/oauth";

export const runtime = "nodejs";

export function GET(req: Request) {
  if (!isStravaConfigured()) {
    return NextResponse.redirect(new URL("/?error=not_configured", req.url));
  }
  // CSRF protection: mint a random state, send it to Strava, and stash it in an
  // HttpOnly cookie so the callback can confirm the response is ours.
  const state = randomUUID();
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set(STRAVA_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
