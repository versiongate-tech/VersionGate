"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const GITHUB_REPO = "https://github.com/dineshkorukonda/VersionGate";

export function SiteHeader({ active }: { active?: "docs" } = {}) {
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as "dark" | "light" | null;
    const initial = saved ?? "light";
    setTheme(initial);
    document.documentElement.className = initial;
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    document.documentElement.className = nextTheme;
    document.documentElement.setAttribute("data-theme", nextTheme);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="font-mono text-sm font-semibold text-foreground">
          VersionGate
        </Link>
        <nav className="flex items-center gap-5 font-mono text-[11px]">
          <Link
            href="/docs"
            className={
              active === "docs"
                ? "text-primary underline underline-offset-4 decoration-primary"
                : "text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-4 hover:decoration-primary"
            }
          >
            Docs
          </Link>
          <Link
            href={GITHUB_REPO}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-4 hover:decoration-primary"
          >
            GitHub
          </Link>
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            Home
          </Link>
          <button type="button" onClick={toggleTheme} className="text-muted-foreground hover:text-foreground">
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </nav>
      </div>
    </header>
  );
}
