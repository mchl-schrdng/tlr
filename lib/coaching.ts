import type { ActivityRow, StreamSet } from "@/lib/db";
import { computeAcwr, sessionLoad, type Acwr } from "@/lib/metrics/aggregate";
import { ACWR_LOW, ACWR_HIGH, ACWR_DANGER, DECOUPLING_THRESHOLD } from "@/lib/config";
import type { Dictionary } from "@/lib/i18n/dict";

export type Recommendation = {
  level: "good" | "warn" | "bad";
  title: string;
  message: string;
};

const DAY = 86400_000;
const lo = String(ACWR_LOW);
const hi = String(ACWR_HIGH);
const danger = String(ACWR_DANGER);

// Deterministic coaching from recent training. Strings come from the dictionary
// `t`; `recentDecouplingPct` is the median aerobic decoupling over recent runs.
export function coach(
  t: Dictionary,
  activities: ActivityRow[],
  now = new Date(),
  recentDecouplingPct: number | null = null,
  getStream?: (id: number) => StreamSet | null,
): { acwr: Acwr; recommendations: Recommendation[] } {
  const c = t.coach;
  const acwr = computeAcwr(activities, now, getStream);
  const recs: Recommendation[] = [];
  const nowMs = now.getTime();

  const last7 = activities.filter((a) => nowMs - new Date(a.start_date).getTime() < 7 * DAY);
  const daysSinceLast = activities.length
    ? Math.floor(
        (nowMs - Math.max(...activities.map((a) => new Date(a.start_date).getTime()))) / DAY,
      )
    : Infinity;

  // --- ACWR / load ---
  if (acwr.ratio === null) {
    recs.push({ level: "warn", title: c.notEnough.title, message: c.notEnough.message });
  } else if (acwr.ratio > ACWR_DANGER) {
    recs.push({ level: "bad", title: c.overload.title, message: c.overload.message(acwr.ratio.toFixed(2), danger) });
  } else if (acwr.ratio > ACWR_HIGH) {
    recs.push({ level: "warn", title: c.rising.title, message: c.rising.message(acwr.ratio.toFixed(2), lo, hi) });
  } else if (acwr.ratio < ACWR_LOW) {
    recs.push({ level: "warn", title: c.underloaded.title, message: c.underloaded.message(acwr.ratio.toFixed(2), lo) });
  } else {
    recs.push({ level: "good", title: c.balanced.title, message: c.balanced.message(acwr.ratio.toFixed(2), lo, hi) });
  }

  // --- Aerobic base / cardiac drift ---
  if (recentDecouplingPct != null && recentDecouplingPct > DECOUPLING_THRESHOLD) {
    recs.push({ level: "warn", title: c.aerobic.title, message: c.aerobic.message(recentDecouplingPct.toFixed(1)) });
  }

  // --- Frequency / rest ---
  if (daysSinceLast >= 5 && daysSinceLast !== Infinity) {
    recs.push({ level: "warn", title: c.returnCare.title, message: c.returnCare.message(daysSinceLast) });
  } else if (last7.length === 0) {
    recs.push({ level: "warn", title: c.quiet.title, message: c.quiet.message });
  }

  // --- Next-session suggestion ---
  recs.push(nextSession(t, last7, acwr, getStream));

  return { acwr, recommendations: recs };
}

// Suggest the next session from the last 7 days' pattern and current load.
function nextSession(
  t: Dictionary,
  last7: ActivityRow[],
  acwr: Acwr,
  getStream?: (id: number) => StreamSet | null,
): Recommendation {
  const n = t.coach.next;
  const hadHardRecently = last7.some(
    (a) => sessionLoad(a, getStream ? getStream(a.id) : null) >= 80,
  );
  const km7 = last7.reduce((s, a) => s + a.distance / 1000, 0);

  if (acwr.ratio != null && acwr.ratio > ACWR_DANGER) {
    return { level: "bad", title: n.rest.title, message: n.rest.message };
  }
  if (last7.length >= 4 || hadHardRecently) {
    return { level: "good", title: n.longRun.title, message: n.longRun.message };
  }
  if (km7 < 15 && last7.length <= 2) {
    return { level: "good", title: n.tempo.title, message: n.tempo.message };
  }
  return { level: "good", title: n.easy.title, message: n.easy.message };
}
