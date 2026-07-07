"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav({ labels }: { labels: { dashboard: string; runs: string } }) {
  const pathname = usePathname();
  const links = [
    { href: "/", label: labels.dashboard },
    { href: "/activities", label: labels.runs },
  ];
  return (
    <nav className="nav">
      {links.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : ""}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
