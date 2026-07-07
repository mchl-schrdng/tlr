"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncButton({ full = false, label }: { full?: boolean; label?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [msg, setMsg] = useState<string>("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (state !== "loading") return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [state]);

  const elapsedS = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const progress = useMemo(() => optimisticProgress(elapsedS, full), [elapsedS, full]);
  const phase = syncPhase(elapsedS, full);

  async function sync() {
    setState("loading");
    setMsg("");
    setStartedAt(Date.now());
    setNow(Date.now());
    try {
      const res = await fetch(`/api/sync${full ? "?full=1" : ""}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setState("error");
        setStartedAt(null);
        setMsg(data.error === "not_connected" ? "Connect your Strava account first." : String(data.error));
        return;
      }
      setState("idle");
      setStartedAt(null);
      setMsg(`${data.runsSynced} run(s) synced, ${data.streamsFetched} with stream details.`);
      router.refresh();
    } catch (e) {
      setState("error");
      setStartedAt(null);
      setMsg(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <span className="sync-control">
      <button className="btn secondary" onClick={sync} disabled={state === "loading"}>
        {state === "loading" ? "Syncing..." : (label ?? (full ? "Full resync" : "Sync"))}
      </button>
      {state === "loading" && (
        <span className="sync-progress" role="status" aria-live="polite">
          <span className="sync-progress-top">
            <span>{phase}</span>
            <span>{elapsedS}s</span>
          </span>
          <span
            className="sync-progress-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <span style={{ width: `${progress}%` }} />
          </span>
        </span>
      )}
      {msg && <span className={state === "error" ? "sync-message error" : "sync-message"}>{msg}</span>}
    </span>
  );
}

function optimisticProgress(elapsedS: number, full: boolean): number {
  const expected = full ? 75 : 28;
  const curve = 100 * (1 - Math.exp(-elapsedS / expected));
  return Math.min(92, Math.max(8, curve));
}

function syncPhase(elapsedS: number, full: boolean): string {
  if (elapsedS < 3) return "Connecting to Strava";
  if (elapsedS < 10) return "Importing activities";
  if (elapsedS < (full ? 45 : 18)) return "Fetching GPS/HR streams";
  return "Finalizing local cache";
}
