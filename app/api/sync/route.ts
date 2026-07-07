import { NextResponse } from "next/server";
import {
  fetchActivities,
  fetchStreams,
  fetchAthleteRaw,
  fetchZonesRaw,
  NotConnectedError,
  type SummaryActivity,
} from "@/lib/strava/client";
import {
  upsertActivity,
  saveStreams,
  runActivityIdsMissingStreams,
  latestActivityDate,
  saveGear,
  saveZones,
  saveAthleteProfile,
  type ActivityRow,
} from "@/lib/db";
import { mapAthlete, mapGearFromAthlete, mapZones } from "@/lib/providers/strava/map";
import { isSameOrigin } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;

const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);

function isRun(a: SummaryActivity): boolean {
  return RUN_TYPES.has(a.sport_type ?? "") || RUN_TYPES.has(a.type);
}

function toRow(a: SummaryActivity): ActivityRow {
  return {
    id: a.id,
    name: a.name,
    start_date: a.start_date,
    type: "Run", // normalized so the rest of the app filters uniformly
    distance: a.distance,
    moving_time: a.moving_time,
    elapsed_time: a.elapsed_time,
    avg_hr: a.average_heartrate ?? null,
    max_hr: a.max_heartrate ?? null,
    elevation_gain: a.total_elevation_gain ?? null,
    avg_cadence: a.average_cadence ?? null,
    avg_speed: a.average_speed ?? null,
    suffer_score: a.suffer_score ?? null,
  };
}

// POST /api/sync?full=1  -> re-fetch everything; otherwise incremental (since last stored run).
export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const url = new URL(req.url);
    const full = url.searchParams.get("full") === "1";

    let afterEpoch: number | undefined;
    if (!full) {
      const latest = latestActivityDate();
      if (latest) afterEpoch = Math.floor(new Date(latest).getTime() / 1000);
    }

    const activities = (await fetchActivities(afterEpoch)).filter(isRun);
    for (const a of activities) {
      upsertActivity(toRow(a), a);
    }

    // Fetch streams for every cached run still missing them. This covers the
    // runs just upserted plus any left behind by an earlier partial sync, so a
    // stream failure is recovered on the next incremental sync — not stranded
    // until a full resync (activities are committed before streams are fetched).
    let streamsFetched = 0;
    for (const id of runActivityIdsMissingStreams()) {
      const streams = await fetchStreams(id);
      if (streams) {
        saveStreams(id, streams);
        streamsFetched++;
      }
    }

    // Enrich reference data (best-effort): athlete profile, gear, real zones.
    let gearSynced = 0;
    try {
      const athleteRaw = await fetchAthleteRaw();
      saveAthleteProfile(mapAthlete(athleteRaw));
      const gear = mapGearFromAthlete(athleteRaw);
      saveGear(gear);
      gearSynced = gear.length;
      try {
        const zonesRaw = await fetchZonesRaw();
        saveZones(mapZones(zonesRaw, athleteRaw));
      } catch {
        // Zone data is unavailable for some accounts; keep the rest of the sync.
      }
    } catch {
      // Athlete/gear fetch failed; the activity sync still succeeded.
    }

    return NextResponse.json({
      ok: true,
      runsSynced: activities.length,
      streamsFetched,
      gearSynced,
      mode: full ? "full" : "incremental",
    });
  } catch (e) {
    if (e instanceof NotConnectedError) {
      return NextResponse.json({ ok: false, error: "not_connected" }, { status: 401 });
    }
    const msg = e instanceof Error ? e.message : "sync_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
