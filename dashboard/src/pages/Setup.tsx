import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { applySetup, ApiError } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

export function Setup() {
  const navigate = useNavigate();

  const [domain, setDomain] = useState("");
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await applySetup({
        domain: domain.trim(),
        databaseUrl: databaseUrl.trim(),
        geminiApiKey: geminiApiKey.trim() || undefined,
      });
      setSuccess(true);
      setTimeout(() => navigate("/", { replace: true }), 1500);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">VERSIONGATE</h1>
          <p className="text-muted-foreground">
            Configure your deployment engine to get started.
          </p>
        </div>

        {success ? (
          <Alert>
            <AlertTitle>Setup complete</AlertTitle>
            <AlertDescription>
              Redirecting to the dashboard…
            </AlertDescription>
          </Alert>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Initial Configuration</CardTitle>
              <CardDescription>
                Provide your server domain, database connection, and optional
                integrations. This wizard writes your <code>.env</code>, runs
                database migrations, and configures Nginx.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label
                    htmlFor="domain"
                    className="text-sm font-medium leading-none"
                  >
                    Domain or Server IP{" "}
                    <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="domain"
                    placeholder="engine.example.com or 192.168.1.10"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    required
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    The hostname or IPv4 address where VersionGate is reachable.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="databaseUrl"
                    className="text-sm font-medium leading-none"
                  >
                    PostgreSQL URL{" "}
                    <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="databaseUrl"
                    type="url"
                    placeholder="postgresql://user:pass@host:5432/versiongate"
                    value={databaseUrl}
                    onChange={(e) => setDatabaseUrl(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    A full PostgreSQL connection string. Local or{" "}
                    <a
                      href="https://neon.tech"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      Neon
                    </a>{" "}
                    free tier both work.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="geminiApiKey"
                    className="text-sm font-medium leading-none"
                  >
                    Gemini API Key{" "}
                    <span className="text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </label>
                  <Input
                    id="geminiApiKey"
                    placeholder="AIza…"
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enables AI-powered CI pipeline generation for your projects.
                  </p>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertTitle>Setup failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={submitting}
                >
                  {submitting ? "Applying…" : "Apply Configuration"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
