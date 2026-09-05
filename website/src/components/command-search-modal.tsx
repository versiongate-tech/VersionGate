"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export interface SearchItem {
  id: string;
  category: "API Route" | "Documentation" | "Architecture" | "Host Script";
  title: string;
  description: string;
  href: string;
  snippet?: string;
}

const SEARCH_ITEMS: SearchItem[] = [
  {
    id: "api-deploy",
    category: "API Route",
    title: "POST /api/v1/deploy",
    description: "Enqueue a blue/green deploy job for a projectId and environmentId",
    href: "/docs/api-reference",
    snippet: '{"projectId":"proj_abc","environmentId":"env_prod"}',
  },
  {
    id: "api-rollback",
    category: "API Route",
    title: "POST /api/v1/projects/:id/rollback",
    description: "Enqueue rollback to the previous deployment record for an environment",
    href: "/docs/api-reference",
    snippet: "Authorization: Bearer vg_live_...",
  },
  {
    id: "api-proxy",
    category: "API Route",
    title: "GET /p/:projectName/:envName/*",
    description: "Stage path proxy to the active container port (Fastify, not Nginx location blocks)",
    href: "/docs/networking",
    snippet: "/p/my-app/staging/api/health",
  },
  {
    id: "api-tokens",
    category: "API Route",
    title: "POST /api/v1/auth/tokens",
    description: "Create a vg_live_... Bearer token (SHA-256 hash stored in PostgreSQL)",
    href: "/docs/api-reference",
    snippet: '{"name":"CI deploy"}',
  },
  {
    id: "api-health",
    category: "API Route",
    title: "GET /api/v1/system/engine-health",
    description: "Background monitor report: DB latency, Redis, containers, CPU/RAM/disk",
    href: "/docs/api-reference",
    snippet: "EngineHealthMonitorService.getLatestReport()",
  },
  {
    id: "script-reset",
    category: "Host Script",
    title: "bun run reset-password",
    description: "Reset administrator password on the host via PostgreSQL",
    href: "/docs/quick-start",
    snippet: "bun run reset-password admin@example.com 'NewPass123!'",
  },
  {
    id: "doc-arch",
    category: "Architecture",
    title: "Blue-Green Host Ports",
    description: "basePort (BLUE) and basePort+1 (GREEN) per environment; one container active at a time",
    href: "/docs/architecture",
  },
  {
    id: "doc-networking",
    category: "Documentation",
    title: "Stage Path Proxy",
    description: "/p/:project/:env routes defined in proxy.routes.ts",
    href: "/docs/networking",
  },
  {
    id: "doc-troubleshooting",
    category: "Documentation",
    title: "Domain troubleshooting",
    description: "PM2 online but hostname does not open: DNS split, hairpin NAT, duplicate nginx vhosts",
    href: "/docs/troubleshooting",
    snippet: "curl -sI --max-time 5 -H \"Host: YOUR_DOMAIN\" http://127.0.0.1/",
  },
  {
    id: "doc-quickstart",
    category: "Documentation",
    title: "Host bootstrap",
    description: "install.sh, PostgreSQL, Redis, Docker, and first project setup",
    href: "/docs/quick-start",
  },
];

export function CommandSearchModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery("");
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filtered =
    query.trim() === ""
      ? SEARCH_ITEMS
      : SEARCH_ITEMS.filter(
          (item) =>
            item.title.toLowerCase().includes(query.toLowerCase()) ||
            item.description.toLowerCase().includes(query.toLowerCase()) ||
            item.category.toLowerCase().includes(query.toLowerCase())
        );

  const handleSelect = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-2xl rounded border border-zinc-700 bg-zinc-950 shadow-2xl overflow-hidden z-10">
        <div className="flex items-center border-b border-zinc-800 px-4 py-3 bg-black">
          <span className="font-mono text-xs text-zinc-500 mr-3">///</span>
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search API routes, docs, or host scripts..."
            className="w-full bg-transparent font-mono text-xs text-white placeholder-zinc-500 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="rounded border border-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-400 hover:text-white"
          >
            ESC
          </button>
        </div>

        <div className="max-h-[380px] overflow-y-auto p-2 space-y-1 divide-y divide-zinc-900">
          {filtered.length === 0 ? (
            <div className="py-8 text-center font-mono text-xs text-zinc-500">
              No matches for &quot;{query}&quot;.
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelect(item.href)}
                className="w-full text-left p-3 rounded hover:bg-zinc-900 transition flex items-center justify-between group"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[9px] text-zinc-300 font-bold border border-zinc-700">
                      {item.category}
                    </span>
                    <span className="font-mono text-xs font-bold text-white group-hover:text-sky-300 transition">
                      {item.title}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-zinc-400">{item.description}</p>
                  {item.snippet && (
                    <p className="font-mono text-[10px] text-zinc-500 bg-zinc-900/80 px-2 py-1 rounded inline-block">
                      {item.snippet}
                    </p>
                  )}
                </div>
                <span className="font-mono text-[10px] text-zinc-500 group-hover:text-white transition">
                  [ Select ]
                </span>
              </button>
            ))
          )}
        </div>

        <div className="border-t border-zinc-800 px-4 py-2 bg-black flex items-center justify-between font-mono text-[10px] text-zinc-500">
          <span>Navigation: click to open doc</span>
          <span>Shortcut: Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
