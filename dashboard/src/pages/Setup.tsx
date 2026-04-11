import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { applySetup, getSetupStatus, type SetupStatus } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

function defaultDomain(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname || "";
}

export function Setup() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [domain, setDomain] = useState(defaultDomain);
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const s = await getSetupStatus();
      setStatus(s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load setup status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const ready =
    status &&
    status.configured &&
    status.dbConnected &&
    !status.needsRestart;

  useEffect(() => {
    if (ready) {
      navigate("/", { replace: true });
    }
  }, [ready, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await applySetup({
        domain: domain.trim(),
        databaseUrl: databaseUrl.trim(),
        adminEmail: adminEmail.trim(),
        adminPassword,
        geminiApiKey: geminiApiKey.trim() || undefined,
      });
      toast.success(
        "Setup complete — you're signed in. If deploy jobs don't run, restart the worker (e.g. pm2 restart versiongate-worker)."
      );
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !status) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-muted-foreground">
        Loading setup…
      </div>
    );
  }

  return (
    <div className="relative min-h-svh overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,oklch(0.35_0.12_195/0.25),transparent)]" />
      <div className="relative mx-auto flex min-h-svh max-w-lg flex-col justify-center px-4 py-12">
        <div className="mb-8 space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">VersionGate</p>
          <h1 className="text-3xl font-semibold tracking-tight">First-time setup</h1>
          <p className="text-sm text-muted-foreground">
            Connect PostgreSQL and set how the dashboard is reached. A running database is required.
          </p>
        </div>

        {status?.needsRestart && (
          <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-amber-200">Restart required</CardTitle>
              <CardDescription className="text-amber-200/80">
                <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">DATABASE_URL</code> is in{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">.env</code> but this API process
                has not loaded it yet (unusual). Restart the API; restart the worker too so deploy jobs use the
                database:{" "}
                <code className="mt-1 block rounded bg-muted px-2 py-1 text-xs text-foreground">
                  pm2 restart versiongate-api versiongate-worker
                </code>
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <Card className="border-border/50 bg-card/80 shadow-xl ring-1 ring-border/40 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Database and domain</CardTitle>
            <CardDescription>
              Use the same PostgreSQL URL format as <code className="rounded bg-muted px-1 py-0.5 text-xs">DATABASE_URL</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="vg-domain" className="text-sm font-medium">
                  Public hostname or IP
                </label>
                <Input
                  id="vg-domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="example.com or 203.0.113.10"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="vg-db" className="text-sm font-medium">
                  Database URL
                </label>
                <Input
                  id="vg-db"
                  value={databaseUrl}
                  onChange={(e) => setDatabaseUrl(e.target.value)}
                  placeholder="postgresql://user:pass@localhost:5432/versiongate"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="vg-admin-email" className="text-sm font-medium">
                  Admin email
                </label>
                <Input
                  id="vg-admin-email"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="vg-admin-password" className="text-sm font-medium">
                  Admin password
                </label>
                <Input
                  id="vg-admin-password"
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="At least 10 characters"
                  autoComplete="new-password"
                  required
                  minLength={10}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="vg-gemini" className="text-sm font-medium">
                  Gemini API key (optional)
                </label>
                <Input
                  id="vg-gemini"
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="Leave empty if not using AI features"
                  autoComplete="off"
                />
              </div>
              <Button type="submit" className="w-full shadow-lg shadow-primary/15" disabled={submitting}>
                {submitting ? "Saving…" : "Save and apply"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Toaster position="top-center" richColors theme="dark" />
    </div>
  );
}
