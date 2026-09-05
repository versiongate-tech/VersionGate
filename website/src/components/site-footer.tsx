import Link from "next/link";

const GITHUB_REPO = "https://github.com/dineshkorukonda/VersionGate";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-black py-12 transition-colors [.light_&]:border-border [.light_&]:bg-background">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="font-mono text-[11px] leading-relaxed text-white/40 [.light_&]:text-muted-foreground">
          VersionGate · personal deploy tool ·{" "}
          <Link href={GITHUB_REPO} className="text-white/55 underline-offset-2 hover:underline [.light_&]:text-foreground">
            source
          </Link>{" "}
          · MIT · Dinesh Korukonda
        </p>
        <div className="flex gap-4 font-mono text-[11px]">
          <Link href="/docs" className="text-white/45 hover:text-white [.light_&]:text-muted-foreground">
            Docs
          </Link>
          <Link href="/changelog" className="text-white/45 hover:text-white [.light_&]:text-muted-foreground">
            Changelog
          </Link>
        </div>
      </div>
    </footer>
  );
}
