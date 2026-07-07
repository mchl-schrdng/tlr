import type { DailyLoad } from "@/lib/metrics/dashboard";

function intensity(load: number, max: number): number {
  if (load <= 0 || max <= 0) return 0;
  if (load / max > 0.75) return 4;
  if (load / max > 0.45) return 3;
  if (load / max > 0.2) return 2;
  return 1;
}

export default function LoadCalendar({ days }: { days: DailyLoad[] }) {
  const maxLoad = Math.max(0, ...days.map((d) => d.load));
  return (
    <div className="load-calendar" aria-label="Load calendar">
      {days.map((day) => {
        const level = intensity(day.load, maxLoad);
        return (
          <div
            key={day.date}
            className={`load-day level-${level}`}
            title={`${day.date} · ${day.km.toFixed(1)} km · load ${Math.round(day.load)}`}
          >
            <span>{new Date(day.date).getDate() === 1 ? day.date.slice(5, 7) : ""}</span>
          </div>
        );
      })}
    </div>
  );
}
