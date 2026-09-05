"use client";

import { useEffect, useMemo, useState } from "react";

const NODES = [
  { label: "BUILD", angle: -18 },
  { label: "HEALTH", angle: 42 },
  { label: "SWAP", angle: 118 },
  { label: "ROLLBACK", angle: 198 },
  { label: "BLUE", angle: 258 },
  { label: "GREEN", angle: 318 },
] as const;

export function HeroDeployVisual() {
  const [active, setActive] = useState(0);

  const rays = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => ({
        id: i,
        rotate: (360 / 42) * i,
        length: i % 3 === 0 ? 46 : i % 2 === 0 ? 38 : 30,
        opacity: i % 4 === 0 ? 0.28 : 0.12,
      })),
    [],
  );

  useEffect(() => {
    const id = setInterval(() => {
      setActive((n) => (n + 1) % NODES.length);
    }, 1400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative h-full min-h-[100vh] w-full overflow-hidden bg-black">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_48%,rgba(62,255,168,0.22),transparent_44%),radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.05),transparent_35%)]" />

      <div className="absolute inset-y-0 right-[-8%] hidden w-[70%] items-center justify-center lg:flex xl:right-[-2%] xl:w-[62%]">
        <div className="relative aspect-square w-full max-w-[720px]">
          <div className="landing-spin-slow absolute inset-[8%]">
            {rays.map((ray) => (
              <span
                key={ray.id}
                className="absolute left-1/2 top-1/2 origin-top"
                style={{
                  width: 1,
                  height: `${ray.length}%`,
                  opacity: ray.opacity + 0.12,
                  transform: `translate(-50%, 0) rotate(${ray.rotate}deg)`,
                  background:
                    "linear-gradient(to bottom, rgba(62,255,168,0.95), rgba(255,255,255,0.18) 50%, transparent)",
                }}
              />
            ))}
          </div>

          <div className="absolute left-1/2 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3effa8] shadow-[0_0_48px_rgba(62,255,168,1)] landing-pulse-core" />
          <div className="absolute left-1/2 top-1/2 size-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#3effa8]/35" />
          <div className="absolute left-1/2 top-1/2 size-52 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
          <div className="absolute left-1/2 top-1/2 size-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/15" />

          {NODES.map((node, idx) => {
            const rad = (node.angle * Math.PI) / 180;
            const x = 50 + Math.cos(rad) * 38;
            const y = 50 + Math.sin(rad) * 38;
            const isActive = idx === active;
            return (
              <div
                key={node.label}
                className={`absolute -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.16em] transition-all duration-500 ${
                  isActive
                    ? "bg-[#3effa8] text-black shadow-[0_0_28px_rgba(62,255,168,0.55)]"
                    : "border border-white/15 bg-black/70 text-white/70"
                }`}
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                {node.label}
              </div>
            );
          })}

          <div className="absolute bottom-[12%] left-1/2 w-[70%] -translate-x-1/2 border border-white/10 bg-black/60 px-4 py-3 font-mono text-[11px] text-white/55 backdrop-blur-sm">
            <span className="text-[#3effa8]">slots</span>
            <span className="ml-3">:3100 blue · :3101 green · one active upstream</span>
          </div>
        </div>
      </div>

      {/* mobile kinetic strip */}
      <div className="absolute inset-x-0 bottom-8 flex justify-center gap-2 px-4 lg:hidden">
        {NODES.slice(0, 4).map((node, idx) => (
          <span
            key={node.label}
            className={`px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] ${
              idx === active % 4
                ? "bg-[#3effa8] text-black"
                : "border border-white/15 text-white/60"
            }`}
          >
            {node.label}
          </span>
        ))}
      </div>
    </div>
  );
}
