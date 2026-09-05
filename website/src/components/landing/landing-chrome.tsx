"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const GITHUB = "https://github.com/dineshkorukonda/VersionGate";

const NAV = [
  { href: "#overview", label: "Overview" },
  { href: "#pipeline", label: "Pipeline" },
  { href: "#spec", label: "Spec" },
  { href: "#api", label: "API" },
  { href: "#run", label: "Run" },
] as const;

export function LandingShellHeader() {
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as "dark" | "light" | null;
    const t = saved ?? "light";
    setTheme(t);
    document.documentElement.className = t;
    document.documentElement.setAttribute("data-theme", t);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.className = next;
    document.documentElement.setAttribute("data-theme", next);
  };

  return (
    <header className="vg-rule sticky top-0 z-50 bg-[var(--vg-bg)]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-6">
        <Link href="/" className="font-mono text-sm font-semibold tracking-tight text-[var(--vg-text)]">
          VersionGate
        </Link>
        <div className="flex items-center gap-5">
          <nav className="hidden gap-4 sm:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="vg-nav-link">
                {n.label}
              </Link>
            ))}
          </nav>
          <Link href="/docs" className="vg-nav-link hidden sm:inline">
            Docs
          </Link>
          <Link href={GITHUB} target="_blank" rel="noreferrer" className="vg-nav-link">
            GitHub
          </Link>
          <button type="button" onClick={toggle} className="vg-nav-link">
            {theme === "light" ? "Dark" : "Light"}
          </button>
        </div>
      </div>
    </header>
  );
}

export function LandingFooter() {
  return (
    <footer className="vg-rule mt-20 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 px-6 font-mono text-[11px] text-[var(--vg-muted)] sm:flex-row sm:justify-between">
        <p>VersionGate · MIT · Dinesh Korukonda</p>
        <p>
          <Link href="/docs" className="vg-link-muted">
            docs
          </Link>
          {" · "}
          <Link href="/changelog" className="vg-link-muted">
            changelog
          </Link>
          {" · "}
          <Link href={GITHUB} className="vg-link-muted">
            source
          </Link>
        </p>
      </div>
    </footer>
  );
}
