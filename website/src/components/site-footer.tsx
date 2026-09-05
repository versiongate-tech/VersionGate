import Link from "next/link";

const GITHUB_REPO = "https://github.com/dineshkorukonda/VersionGate";

const LINKS = [
  { label: "Documentation", href: "/docs" },
  { label: "Changelog", href: "/changelog" },
  { label: "API Reference", href: "/docs/api-reference" },
  { label: "GitHub Repository", href: GITHUB_REPO },
  { label: "Issues & Support", href: `${GITHUB_REPO}/issues` },
  { label: "MIT License", href: `${GITHUB_REPO}/blob/main/LICENSE` },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-black py-14 transition-colors [.light_&]:border-border [.light_&]:bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-white [.light_&]:text-foreground">
            VersionGate
          </p>
          <p className="font-mono text-[11px] text-white/40 [.light_&]:text-muted-foreground">
            Single-container blue/green deploys · © {new Date().getFullYear()} Dinesh Korukonda · MIT
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-8 gap-y-2">
          {LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45 transition hover:text-white [.light_&]:text-muted-foreground [.light_&]:hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
