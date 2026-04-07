import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { applySetup, getSetupStatus, type SetupStatus } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

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
        geminiApiKey: geminiApiKey.trim() || undefined,
      });
      toast.success("Configuration saved. Restart the API and worker to load the new database URL.");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !status) {
    return (
      <div className="mx-auto flex max-w-lg flex-1 items-center justify-center text-muted-foreground">
        Loading setup…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">First-time setup</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect PostgreSQL and set how the dashboard is reached. You need a running database before
          continuing.
        </p>
      </div>

      {status?.needsRestart && (
        <Card className="border-amber-500/40 bg-amber-500/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Restart required</CardTitle>
            <CardDescription>
              Configuration was saved to disk, but this server process has not loaded{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">DATABASE_URL</code> yet. Restart
              the API (and worker), for example:{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                pm2 restart versiongate-api versiongate-worker
              </code>
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Database and domain</CardTitle>
          <CardDescription>
            PostgreSQL connection string (same format as{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">DATABASE_URL</code>).
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
              <p className="text-xs text-muted-foreground">
                Used for nginx proxy hints. Your browser&apos;s host is prefilled when possible.
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="vg-db" className="text-sm font-medium">
                Database URL
              </label>
              <Input
                id="vg-db"
                value={databaseUrl}
                onChange={(e) => setDatabaseUrl(e.target.value)}
                placeholder='postgresql://user:pass@localhost:5432/versiongate'
                autoComplete="off"
                required
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
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Saving…" : "Save and apply"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
