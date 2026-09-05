import { API_GROUPS } from "@/lib/engine-spec";

export function ApiSurface() {
  return (
    <div className="space-y-8">
      {API_GROUPS.map((g) => (
        <div key={g.group}>
          <h3 className="vg-kicker">{g.group}</h3>
          <ul className="mt-3 space-y-2 font-mono text-[11px]">
            {g.routes.map((r) => (
              <li key={r} className="vg-rule pb-2 text-[var(--vg-muted)]">
                <span className="underline decoration-[var(--vg-border)] underline-offset-2">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
