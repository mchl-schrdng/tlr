import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Athlete, Gear, Zones } from "@/lib/model/types";

// Single-user local cache. One SQLite file under ./data.
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "strava.db");

let _db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (_db) return _db;
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS athlete (
      id            INTEGER PRIMARY KEY,
      access_token  TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at    INTEGER NOT NULL,
      raw_json      TEXT
    );
    CREATE TABLE IF NOT EXISTS activities (
      id             INTEGER PRIMARY KEY,
      name           TEXT,
      start_date     TEXT,
      type           TEXT,
      distance       REAL,
      moving_time    INTEGER,
      elapsed_time   INTEGER,
      avg_hr         REAL,
      max_hr         REAL,
      elevation_gain REAL,
      avg_cadence    REAL,
      avg_speed      REAL,
      suffer_score   REAL,
      raw_json       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_activities_start ON activities(start_date);
    CREATE TABLE IF NOT EXISTS streams (
      activity_id INTEGER PRIMARY KEY,
      data_json   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gear (
      id        TEXT PRIMARY KEY,
      data_json TEXT NOT NULL
    );
  `);
  _db = db;
  return db;
}

// ---- Settings (local key/value config, e.g. Strava API credentials) ----

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

// ---- Gear / zones / athlete profile (canonical model, from providers/strava/map) ----

export function saveGear(items: Gear[]): void {
  const stmt = getDb().prepare(
    `INSERT INTO gear (id, data_json) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json`,
  );
  for (const g of items) stmt.run(g.id, JSON.stringify(g));
}

export function saveZones(z: Zones): void {
  setSetting("athlete_zones", JSON.stringify(z));
}

export function saveAthleteProfile(a: Athlete): void {
  setSetting("athlete_profile", JSON.stringify(a));
}

export function getAthleteProfile(): Athlete | null {
  const raw = getSetting("athlete_profile");
  return raw ? (JSON.parse(raw) as Athlete) : null;
}

// ---- Athlete / token ----

export type StoredToken = {
  id: number;
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
};

export function getToken(): StoredToken | null {
  const row = getDb()
    .prepare(`SELECT id, access_token, refresh_token, expires_at FROM athlete LIMIT 1`)
    .get() as StoredToken | undefined;
  return row ?? null;
}

export function saveToken(t: {
  id: number;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  raw?: unknown;
}): void {
  getDb()
    .prepare(
      `INSERT INTO athlete (id, access_token, refresh_token, expires_at, raw_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         expires_at = excluded.expires_at,
         raw_json = excluded.raw_json`,
    )
    .run(t.id, t.access_token, t.refresh_token, t.expires_at, t.raw ? JSON.stringify(t.raw) : null);
}

// ---- Activities ----

export type ActivityRow = {
  id: number;
  name: string;
  start_date: string;
  type: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_gain: number | null;
  avg_cadence: number | null;
  avg_speed: number | null;
  suffer_score: number | null;
};

export function upsertActivity(a: ActivityRow, raw: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO activities
        (id, name, start_date, type, distance, moving_time, elapsed_time,
         avg_hr, max_hr, elevation_gain, avg_cadence, avg_speed, suffer_score, raw_json)
       VALUES (@id, @name, @start_date, @type, @distance, @moving_time, @elapsed_time,
         @avg_hr, @max_hr, @elevation_gain, @avg_cadence, @avg_speed, @suffer_score, @raw_json)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, start_date=excluded.start_date, type=excluded.type,
         distance=excluded.distance, moving_time=excluded.moving_time,
         elapsed_time=excluded.elapsed_time, avg_hr=excluded.avg_hr, max_hr=excluded.max_hr,
         elevation_gain=excluded.elevation_gain, avg_cadence=excluded.avg_cadence,
         avg_speed=excluded.avg_speed, suffer_score=excluded.suffer_score,
         raw_json=excluded.raw_json`,
    )
    .run({
      ...a,
      // node:sqlite named params can't bind null via undefined; coerce.
      avg_hr: a.avg_hr ?? null,
      max_hr: a.max_hr ?? null,
      elevation_gain: a.elevation_gain ?? null,
      avg_cadence: a.avg_cadence ?? null,
      avg_speed: a.avg_speed ?? null,
      suffer_score: a.suffer_score ?? null,
      raw_json: JSON.stringify(raw),
    });
}

export function listActivities(type = "Run"): ActivityRow[] {
  return getDb()
    .prepare(
      `SELECT id, name, start_date, type, distance, moving_time, elapsed_time,
              avg_hr, max_hr, elevation_gain, avg_cadence, avg_speed, suffer_score
       FROM activities WHERE type = ? ORDER BY start_date DESC`,
    )
    .all(type) as ActivityRow[];
}

export function getActivity(id: number): ActivityRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, name, start_date, type, distance, moving_time, elapsed_time,
              avg_hr, max_hr, elevation_gain, avg_cadence, avg_speed, suffer_score
       FROM activities WHERE id = ?`,
    )
    .get(id) as ActivityRow | undefined;
  return row ?? null;
}

export function latestActivityDate(): string | null {
  const row = getDb()
    .prepare(`SELECT start_date FROM activities ORDER BY start_date DESC LIMIT 1`)
    .get() as { start_date: string } | undefined;
  return row?.start_date ?? null;
}

// ---- Streams ----

export type StreamSet = {
  time?: number[];
  distance?: number[];
  heartrate?: number[];
  velocity_smooth?: number[];
  altitude?: number[];
  cadence?: number[];
  temp?: number[];
};

export function saveStreams(activityId: number, streams: StreamSet): void {
  getDb()
    .prepare(
      `INSERT INTO streams (activity_id, data_json) VALUES (?, ?)
       ON CONFLICT(activity_id) DO UPDATE SET data_json = excluded.data_json`,
    )
    .run(activityId, JSON.stringify(streams));
}

export function getStreams(activityId: number): StreamSet | null {
  const row = getDb()
    .prepare(`SELECT data_json FROM streams WHERE activity_id = ?`)
    .get(activityId) as { data_json: string } | undefined;
  return row ? (JSON.parse(row.data_json) as StreamSet) : null;
}

// Run activities still lacking cached streams — includes runs left behind by an
// earlier partial sync, so an incremental sync can recover them without a full
// resync. Newest first.
export function runActivityIdsMissingStreams(): number[] {
  const rows = getDb()
    .prepare(
      `SELECT a.id FROM activities a
       LEFT JOIN streams s ON s.activity_id = a.id
       WHERE a.type = 'Run' AND s.activity_id IS NULL
       ORDER BY a.start_date DESC`,
    )
    .all() as { id: number }[];
  return rows.map((r) => r.id);
}

export function activityRawMap(): Map<number, unknown> {
  const rows = getDb()
    .prepare(`SELECT id, raw_json FROM activities`)
    .all() as { id: number; raw_json: string | null }[];
  const map = new Map<number, unknown>();
  for (const row of rows) {
    if (!row.raw_json) continue;
    try {
      map.set(row.id, JSON.parse(row.raw_json));
    } catch {
      // Keep the cache resilient if an old row contains malformed JSON.
    }
  }
  return map;
}
