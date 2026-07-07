type Tone = "good" | "warn" | "bad" | "info";
type Zone = { upTo: number; tone: Tone };

// A compact status meter: colored good/warn/bad zone bands with a marker at the
// current value, so you can see at a glance whether you sit in the green, amber
// or deep-red part of a metric's range. Server-rendered, no client JS. The value
// is always shown as a number elsewhere, so identity is never color-alone.
export default function Meter({
  value,
  min,
  max,
  zones,
  ticks,
}: {
  value: number | null | undefined;
  min: number;
  max: number;
  zones: Zone[];
  ticks?: number[];
}) {
  if (value == null || !Number.isFinite(value)) return null;
  const span = max - min || 1;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / span) * 100));

  // Soft zone bands as a hard-stop gradient.
  let prev = min;
  const stops = zones
    .map((z) => {
      const seg = `color-mix(in srgb, var(--${z.tone}) 24%, transparent) ${pct(prev).toFixed(1)}% ${pct(z.upTo).toFixed(1)}%`;
      prev = z.upTo;
      return seg;
    })
    .join(", ");

  // Tone of the band the value falls in (marker color).
  let markerTone: Tone = zones[zones.length - 1].tone;
  for (const z of zones) {
    if (value <= z.upTo) {
      markerTone = z.tone;
      break;
    }
  }
  const pegged = value >= max || value <= min;

  return (
    <div className="meter">
      <div className="meter-track" style={{ background: `linear-gradient(90deg, ${stops})` }}>
        <span
          className={`meter-marker${pegged ? " pegged" : ""}`}
          style={{ left: `${pct(value)}%`, background: `var(--${markerTone})` }}
        />
      </div>
      {ticks && ticks.length > 0 && (
        <div className="meter-ticks">
          {ticks.map((tk) => (
            <span key={tk} className="meter-tick" style={{ left: `${pct(tk)}%` }}>
              {tk}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
