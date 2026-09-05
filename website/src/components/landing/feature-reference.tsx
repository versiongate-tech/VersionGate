"use client";

import { useState } from "react";
import type { SpecSection } from "@/lib/engine-spec";

export function FeatureReference({ sections }: { sections: SpecSection[] }) {
  const [open, setOpen] = useState<string>(sections[0]?.id ?? "");

  return (
    <div className="divide-y divide-[var(--vg-border)] border border-[var(--vg-border)]">
      {sections.map((section) => {
        const isOpen = open === section.id;
        return (
          <div key={section.id} id={section.id}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? "" : section.id)}
              className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left"
            >
              <div>
                <h3 className="font-mono text-sm font-semibold text-[var(--vg-text)]">{section.title}</h3>
                <p className="mt-1 font-mono text-[11px] text-[var(--vg-muted)]">{section.blurb}</p>
              </div>
              <span className="shrink-0 font-mono text-xs text-[var(--vg-accent)]">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <div className="overflow-x-auto border-t border-[var(--vg-border)]">
                <table className="w-full min-w-[640px] text-left font-mono text-[11px]">
                  <thead>
                    <tr className="vg-rule text-[var(--vg-muted)]">
                      <th className="px-4 py-2 font-normal">feature</th>
                      <th className="px-4 py-2 font-normal">mechanism</th>
                      <th className="px-4 py-2 font-normal">api</th>
                      <th className="px-4 py-2 font-normal">src/</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.items.map((item) => (
                      <tr key={item.id} className="vg-rule align-top">
                        <td className="px-4 py-3 text-[var(--vg-text)]">
                          <p className="font-semibold">{item.name}</p>
                          <p className="mt-1 text-[var(--vg-muted)]">{item.summary}</p>
                          {item.limit && (
                            <p className="mt-2 text-[10px] text-[var(--vg-accent)]">limit: {item.limit}</p>
                          )}
                        </td>
                        <td className="max-w-xs px-4 py-3 text-[var(--vg-muted)]">{item.mechanism ?? "—"}</td>
                        <td className="px-4 py-3 text-[var(--vg-text)] underline decoration-[var(--vg-border)] underline-offset-2">
                          {item.api ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-[var(--vg-muted)]">{item.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
