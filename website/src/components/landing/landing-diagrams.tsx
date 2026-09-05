import { PIPELINE_STEPS, STACK } from "@/lib/engine-spec";

export function LandingHeroDiagram() {
  return (
    <div className="vg-panel p-5 font-mono text-[11px]">
      <p className="vg-kicker">topology</p>
      <div className="mt-4 space-y-3 text-[var(--vg-muted)]">
        <p>
          <span className="text-[var(--vg-accent)]">nginx</span> :80/443 → upstream.conf → 127.0.0.1:3100|3101
        </p>
        <p>
          <span className="text-[var(--vg-accent)]">fastify</span> :9090 → api · ws logs · /p/* proxy · dashboard
        </p>
        <p>
          <span className="text-[var(--vg-accent)]">postgres</span> + optional redis → jobs · deployments · locks
        </p>
        <p className="vg-rule pt-3">
          slots:{" "}
          <span className="text-[var(--vg-text)] underline decoration-[var(--vg-accent)] underline-offset-2">
            blue :basePort
          </span>
          {" · "}
          <span className="text-[var(--vg-text)] underline decoration-[var(--vg-accent)] underline-offset-2">
            green :basePort+1
          </span>
        </p>
      </div>
    </div>
  );
}

export function LandingPipeline() {
  return (
    <ol className="divide-y divide-[var(--vg-border)] border border-[var(--vg-border)]">
      {PIPELINE_STEPS.map((s) => (
        <li key={s.n} className="flex gap-4 px-4 py-3 font-mono text-[11px]">
          <span className="text-[var(--vg-accent)]">{s.n}</span>
          <div>
            <p className="uppercase tracking-[0.1em] text-[var(--vg-text)]">{s.label}</p>
            <p className="mt-1 leading-relaxed text-[var(--vg-muted)]">{s.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function LandingStack() {
  return (
    <ul className="space-y-2 font-mono text-[11px]">
      {STACK.map((t) => (
        <li key={t.name} className="flex gap-3 vg-rule pb-2">
          <span className="shrink-0 text-[var(--vg-accent)]">{t.name}</span>
          <span className="text-[var(--vg-muted)]">{t.role}</span>
        </li>
      ))}
    </ul>
  );
}
