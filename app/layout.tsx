import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/Nav";
import LangToggle from "@/components/LangToggle";
import AiAnalystPanel, { AiAnalystProvider, AiAnalystTopButton } from "@/components/AiAnalystPanel";
import { getToken } from "@/lib/db";
import { getT } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tailor",
  description: "Made-to-measure training intelligence from your Strava data.",
  applicationName: "Tailor",
  icons: {
    icon: [
      { url: "/icon.png?v=6", type: "image/png", sizes: "512x512" },
      { url: "/icon.svg?v=6", type: "image/svg+xml" },
      { url: "/favicon.ico?v=6", sizes: "any" },
    ],
    shortcut: "/favicon.ico?v=6",
    apple: "/apple-icon.png?v=6",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getT();
  const connected = !!getToken();
  return (
    <html lang={locale}>
      <body>
        <AiAnalystProvider labels={t.ai}>
          <div className="terrain-field" aria-hidden="true">
            <div className="terrain-layer terrain-layer-a" />
            <div className="terrain-layer terrain-layer-b" />
            <div className="terrain-lines" />
            <div className="terrain-grain" />
          </div>
          <div className="layout">
            <header className="topbar">
              <Link href="/" className="brand">
                <span className="brand-mark" aria-hidden="true">
                  <svg viewBox="0 0 154 54" focusable="false">
                    <defs>
                      <pattern id="tailor-brand-stripes" width="1" height="4.6" patternUnits="userSpaceOnUse">
                        <rect width="1" height="2.25" fill="currentColor" />
                      </pattern>
                      <mask id="tailor-brand-mask">
                        <rect width="154" height="54" fill="black" />
                        <text
                          x="1"
                          y="45"
                          fill="white"
                          fontFamily="Impact, 'Avenir Next Condensed', 'Arial Narrow', sans-serif"
                          fontSize="52"
                          fontStyle="italic"
                          fontWeight="900"
                        >
                          TLR
                        </text>
                      </mask>
                    </defs>
                    <rect className="brand-stripe-fill" width="154" height="54" fill="url(#tailor-brand-stripes)" mask="url(#tailor-brand-mask)" />
                    <path className="brand-cut-line" d="M5 48 36 15M39 48 71 12M97 48l23-36" />
                  </svg>
                </span>
                <span className="brand-copy">
                  <span className="brand-name">Tailor</span>
                  <span className="brand-tagline">{t.brand.tagline}</span>
                </span>
              </Link>
              <Nav labels={{ dashboard: t.nav.dashboard, runs: t.nav.runs }} />
              {connected && <AiAnalystTopButton />}
              <LangToggle locale={locale} />
            </header>
            <AiAnalystPanel />
            <main>{children}</main>
          </div>
        </AiAnalystProvider>
      </body>
    </html>
  );
}
