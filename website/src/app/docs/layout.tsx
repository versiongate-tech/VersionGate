import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { DocsNav } from "./docs-nav";

export const metadata: Metadata = {
  title: "Documentation — VersionGate",
  description: "Setup, architecture, deployment pipeline, networking, domain troubleshooting, and API reference for VersionGate.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader active="docs" />
      <div className="mx-auto flex max-w-6xl gap-10 px-4 py-10 sm:px-6">
        <aside className="hidden w-56 shrink-0 border-r border-border lg:block">
          <div className="sticky top-24 pr-6">
            <div className="mb-4">
              <div className="font-mono text-xs uppercase tracking-wider">Documentation</div>
              <div className="font-mono text-[10px] text-muted-foreground">v1.0-stable</div>
            </div>
            <DocsNav />
          </div>
        </aside>
        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
      <SiteFooter />
    </div>
  );
}
