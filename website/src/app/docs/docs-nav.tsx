"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/docs", label: "Introduction", num: "01" },
  { href: "/docs/quick-start", label: "Quick Start", num: "02" },
  { href: "/docs/architecture", label: "Architecture", num: "03" },
  { href: "/docs/deployment", label: "Deployment", num: "04" },
  { href: "/docs/networking", label: "Networking", num: "05" },
  { href: "/docs/troubleshooting", label: "Troubleshooting", num: "06" },
  { href: "/docs/api-reference", label: "API Reference", num: "07" },
] as const;

export function DocsNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 border-l-2 px-3 py-2 font-mono text-xs transition ${
              active
                ? "border-white bg-zinc-900 text-white font-bold"
                : "border-transparent text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900/50 hover:text-white"
            }`}
          >
            <span className="text-[10px] text-zinc-500 font-bold">{item.num} //</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
