"use client";

import { useState } from "react";

type Step = "welcome" | "database" | "domain" | "extras" | "applying" | "done";

interface SetupState {
  databaseUrl: string;
  domain: string;
  geminiApiKey: string;
}

export default function SetupWizard() {
  const [step, setStep] = useState<Step>("welcome");
  const [form, setForm] = useState<SetupState>({
    databaseUrl: "",
    domain: "",
    geminiApiKey: "",
  });
  const [error, setError] = useState("");
  const [applyLog, setApplyLog] = useState<string[]>([]);

  const update = (field: keyof SetupState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const applySetup = async () => {
    setStep("applying");
    setApplyLog(["Connecting to database…"]);

    try {
      const res = await fetch("/api/v1/setup/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: form.domain,
          databaseUrl: form.databaseUrl,
          geminiApiKey: form.geminiApiKey || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || `Setup failed (HTTP ${res.status})`);
        setStep("extras");
        return;
      }

      setApplyLog((prev) => [
        ...prev,
        "Environment file saved ✓",
        "Security key created ✓",
        "Prisma client generated ✓",
        "Database prepared ✓",
        "Setup complete!",
      ]);
      setTimeout(() => setStep("done"), 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      setStep("extras");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo / branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-600/20 mb-4">
            <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">VersionGate Setup</h1>
          <p className="text-zinc-500 text-sm mt-1">Configure your deployment engine from the UI</p>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-1 mb-8">
          {(["welcome", "database", "domain", "extras"] as const).map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                ["welcome", "database", "domain", "extras"].indexOf(step) >= i || step === "applying" || step === "done"
                  ? "bg-emerald-500"
                  : "bg-zinc-800"
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          {/* ── Welcome ─────────────────────── */}
          {step === "welcome" && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Welcome</h2>
              <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                This wizard will configure your VersionGate instance end-to-end. You&apos;ll need:
              </p>
              <ul className="text-sm text-zinc-400 space-y-2 mb-6">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5">•</span>
                  A PostgreSQL database URL
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5">•</span>
                  A domain name or server IP address
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-zinc-600 mt-0.5">•</span>
                  <span className="text-zinc-500">Optional: Gemini API key for AI pipeline generation</span>
                </li>
              </ul>
              <p className="text-xs text-zinc-500 mb-6">
                VersionGate will generate its encryption key and prepare Prisma automatically during setup.
              </p>
              <button
                onClick={() => setStep("database")}
                className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-medium text-sm transition-colors"
              >
                Get Started
              </button>
            </div>
          )}

          {/* ── Database URL ────────────────── */}
          {step === "database" && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Database</h2>
              <p className="text-zinc-400 text-sm mb-4">
                Enter your PostgreSQL connection URL.
              </p>
              <label className="block text-xs text-zinc-500 mb-1.5">DATABASE_URL</label>
              <input
                type="text"
                value={form.databaseUrl}
                onChange={(e) => update("databaseUrl", e.target.value)}
                placeholder="postgresql://user:pass@host:5432/versiongate"
                className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors"
                autoFocus
              />
              {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep("welcome")}
                  className="flex-1 py-2.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    if (!form.databaseUrl.trim()) {
                      setError("Database URL is required");
                      return;
                    }
                    setStep("domain");
                  }}
                  className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-medium text-sm transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* ── Domain / IP ─────────────────── */}
          {step === "domain" && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Access</h2>
              <p className="text-zinc-400 text-sm mb-4">
                How will this instance be accessed? Enter a domain or IP address.
              </p>
              <label className="block text-xs text-zinc-500 mb-1.5">Domain or IP</label>
              <input
                type="text"
                value={form.domain}
                onChange={(e) => update("domain", e.target.value)}
                placeholder="versiongate.example.com or 203.0.113.42"
                className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors"
                autoFocus
              />
              {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep("database")}
                  className="flex-1 py-2.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    if (!form.domain.trim()) {
                      setError("Domain or IP is required");
                      return;
                    }
                    setStep("extras");
                  }}
                  className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-medium text-sm transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* ── Extras (optional) ───────────── */}
          {step === "extras" && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Extras</h2>
              <p className="text-zinc-400 text-sm mb-4">
                Optional settings. You can skip this and configure later.
              </p>
              <label className="block text-xs text-zinc-500 mb-1.5">Gemini API Key (optional)</label>
              <input
                type="text"
                value={form.geminiApiKey}
                onChange={(e) => update("geminiApiKey", e.target.value)}
                placeholder="AIza…"
                className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors"
              />
              <p className="text-zinc-600 text-xs mt-1.5">
                Used for AI-generated CI/CD pipeline YAML. You can skip this and add it later.
              </p>
              {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep("domain")}
                  className="flex-1 py-2.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={applySetup}
                  className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-medium text-sm transition-colors"
                >
                  Apply Configuration
                </button>
              </div>
            </div>
          )}

          {/* ── Applying ────────────────────── */}
          {step === "applying" && (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-600/20 mb-4">
                <svg className="w-5 h-5 text-emerald-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold mb-3">Configuring…</h2>
              <p className="text-sm text-zinc-400 mb-3">
                Writing configuration, generating the encryption key, preparing Prisma, and setting up the database.
              </p>
              <div className="text-left bg-zinc-800/50 rounded-lg p-3">
                {applyLog.map((line, i) => (
                  <p key={i} className="text-xs text-zinc-400 font-mono py-0.5">{line}</p>
                ))}
              </div>
            </div>
          )}

          {/* ── Done ────────────────────────── */}
          {step === "done" && (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-600/20 mb-4">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold mb-2">All Set!</h2>
              <p className="text-zinc-400 text-sm mb-6">
                VersionGate is configured and ready to use. No manual `.env` edits or Prisma commands are needed now.
              </p>
              <a
                href="/"
                className="inline-block w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-medium text-sm transition-colors text-center"
              >
                Open Dashboard
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-zinc-700 text-xs mt-6">
          VersionGate Engine • Zero-downtime deployments
        </p>
      </div>
    </div>
  );
}
