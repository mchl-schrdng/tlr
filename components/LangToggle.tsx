"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Locale } from "@/lib/i18n/config";

// Header FR/EN switch. Writes the `lang` cookie and refreshes the server tree so
// every server component re-reads the locale. No page reload, no state library.
export default function LangToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function set(next: Locale) {
    if (next === locale) return;
    document.cookie = `lang=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div className="lang-toggle" role="group" aria-label="Language" data-pending={pending}>
      {(["en", "fr"] as const).map((l) => (
        <button
          key={l}
          type="button"
          className={l === locale ? "active" : ""}
          aria-pressed={l === locale}
          onClick={() => set(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
