import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getInstanceSettings, getSetupStatus, patchInstanceEnv, type InstanceSettings, type SetupStatus } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DonutChart } from "@/components/charts/DonutChart";

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[minmax(0,200px)_1fr] sm:items-baseline sm:gap-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm text-foreground">{value}</dd>
    </div>
  );
}

function boolBadge(ok: boolean, yes = "Yes", no = "No") {
  return (
    <Badge variant={ok ? "default" : "secondary"} className="font-mono text-xs">
      {ok ? yes : no}
    </Badge>
  );
}

const textareaClass = cn(
  "min-h-[72px] w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm text-foreground shadow-none outline-none",
  "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
);

export function Settings() {
  const [instance, setInstance] = useState<InstanceSettings | null>(null);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [envDraft, setEnvDraft] = useState<Record<string, string>>({});
  const [envSaving, setEnvSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [i, s] = await Promise.all([getInstanceSettings(), getSetupStatus()]);
        if (!cancelled) {
          setInstance(i);
          setSetup(s);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const checkSummary = useMemo(() => {
    if (!instance) return [];
    const checks = [
      instance.databaseUrlInEnvFile,
      instance.databaseUrlLoaded,
      instance.databaseReachable,
      instance.encryptionKeyConfigured,
      instance.geminiConfigured,
      !instance.needsRestart,
    ];
    const pass = checks.filter(Boolean).length;
    return [
      { name: "Pass", value: pass },
      { name: "Attention", value: checks.length - pass },
    ];
  }, [instance]);

  const setEnvField = (key: string, value: string) => {
    setEnvDraft((d) => ({ ...d, [key]: value }));
  };

  const onSaveEnv = async (e: React.FormEvent) => {
    e.preventDefault();
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(envDraft)) {
      const t = v.trim();
      if (t) env[k] = t;
    }
    if (Object.keys(env).length === 0) {
      toast.error("Enter at least one value to write.");
      return;
    }
    setEnvSaving(true);
    try {
      const r = await patchInstanceEnv(env);
      toast.success(r.message);
      setEnvDraft({});
      const [i, s] = await Promise.all([getInstanceSettings(), getSetupStatus()]);
      setInstance(i);
      setSetup(s);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update .env");
    } finally {
      setEnvSaving(false);
    }
  };

  if (loading || !instance || !setup) {
    return (
      <div className="w-full max-w-4xl space-y-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl space-y-10">
      <PageHeader
        title="Settings"
        description="Instance diagnostics, optional updates to the server .env file, and how secrets are handled. Secret values are never read back from the API."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/50 bg-card/60 ring-1 ring-border/30 lg:col-span-2">
          <CardHeader>
            <CardTitle>Basic information</CardTitle>
            <CardDescription>Engine build, runtime mode, and paths used by the control plane.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-3">
              <Row label="Engine version" value={instance.engineVersion} />
              <Row label="Node environment" value={instance.nodeEnv} />
              <Row label="API listen port" value={String(instance.apiPort)} />
              <Row label="Docker network" value={instance.dockerNetwork} />
              <Row label="Projects root" value={instance.projectsRootPath} />
              <Row label="Nginx config path" value={instance.nginxConfigPath} />
              <Row
                label="Prisma schema sync"
                value={
                  instance.prismaSchemaSync === "migrate"
                    ? "migrate (migrate deploy with fallback)"
                    : "push (db push only)"
                }
              />
            </dl>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
          <CardHeader>
            <CardTitle className="text-base">Health checks</CardTitle>
            <CardDescription>Six binary signals from the API.</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart data={checkSummary} />
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
        <CardHeader>
          <CardTitle>Environment and database</CardTitle>
          <CardDescription>Connection state is checked live. Values such as DATABASE_URL are stored in the server .env file.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Setup wizard status</h3>
            <dl className="space-y-3">
              <Row label="Configured" value={boolBadge(setup.configured)} />
              <Row label="Database reachable" value={boolBadge(setup.dbConnected)} />
              <Row label="Process needs restart" value={boolBadge(setup.needsRestart, "Yes — restart API", "No")} />
            </dl>
            {setup.needsRestart ? (
              <p className="text-sm leading-relaxed text-amber-200/90">
                The .env file contains <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">DATABASE_URL</code>, but
                this API process has not loaded it yet. Restart the API and worker (for example{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">pm2 restart versiongate-api versiongate-worker</code>
                ).
              </p>
            ) : null}
          </div>

          <Separator className="bg-border/50" />

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Runtime checks</h3>
            <dl className="space-y-3">
              <Row label="DATABASE_URL in .env file" value={boolBadge(instance.databaseUrlInEnvFile)} />
              <Row label="DATABASE_URL loaded in process" value={boolBadge(instance.databaseUrlLoaded)} />
              <Row label="Database responds" value={boolBadge(instance.databaseReachable)} />
              <Row label="ENCRYPTION_KEY set" value={boolBadge(instance.encryptionKeyConfigured)} />
              <Row label="GEMINI_API_KEY set" value={boolBadge(instance.geminiConfigured)} />
            </dl>
          </div>

          <Separator className="bg-border/50" />

          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p>
              The first-time wizard at <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/setup</code> applies when
              the database is not yet configured.
            </p>
            <p>
              Project-specific variables for deployed apps are configured per project in the database and injected into
              containers at deploy time — not in the server .env editor below.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
        <CardHeader>
          <CardTitle>Update server environment (.env)</CardTitle>
          <CardDescription>
            Merges only the fields you fill in. Existing lines are replaced by key; new keys are appended. A backup is written to{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env.bak</code>. Restart the API and worker after
            saving.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSaveEnv(e)} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="env-database-url">
                DATABASE_URL
              </label>
              <textarea
                id="env-database-url"
                value={envDraft.DATABASE_URL ?? ""}
                onChange={(e) => setEnvField("DATABASE_URL", e.target.value)}
                className={textareaClass}
                placeholder="postgresql://…"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="env-enc">
                  ENCRYPTION_KEY
                </label>
                <Input
                  id="env-enc"
                  type="password"
                  value={envDraft.ENCRYPTION_KEY ?? ""}
                  onChange={(e) => setEnvField("ENCRYPTION_KEY", e.target.value)}
                  placeholder="64-char hex"
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="env-gemini">
                  GEMINI_API_KEY
                </label>
                <Input
                  id="env-gemini"
                  type="password"
                  value={envDraft.GEMINI_API_KEY ?? ""}
                  onChange={(e) => setEnvField("GEMINI_API_KEY", e.target.value)}
                  placeholder="Optional"
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="env-gemini-model">
                GEMINI_MODEL
              </label>
              <Input
                id="env-gemini-model"
                value={envDraft.GEMINI_MODEL ?? ""}
                onChange={(e) => setEnvField("GEMINI_MODEL", e.target.value)}
                placeholder="gemini-2.5-pro"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="env-docker">
                  DOCKER_NETWORK
                </label>
                <Input
                  id="env-docker"
                  value={envDraft.DOCKER_NETWORK ?? ""}
                  onChange={(e) => setEnvField("DOCKER_NETWORK", e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="env-nginx">
                  NGINX_CONFIG_PATH
                </label>
                <Input
                  id="env-nginx"
                  value={envDraft.NGINX_CONFIG_PATH ?? ""}
                  onChange={(e) => setEnvField("NGINX_CONFIG_PATH", e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="env-projects">
                PROJECTS_ROOT_PATH
              </label>
              <Input
                id="env-projects"
                value={envDraft.PROJECTS_ROOT_PATH ?? ""}
                onChange={(e) => setEnvField("PROJECTS_ROOT_PATH", e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="env-prisma">
                  PRISMA_SCHEMA_SYNC
                </label>
                <select
                  id="env-prisma"
                  value={envDraft.PRISMA_SCHEMA_SYNC ?? ""}
                  onChange={(e) => setEnvField("PRISMA_SCHEMA_SYNC", e.target.value)}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                >
                  <option value="">Leave unchanged</option>
                  <option value="migrate">migrate</option>
                  <option value="push">push</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="env-log">
                  LOG_LEVEL
                </label>
                <Input
                  id="env-log"
                  value={envDraft.LOG_LEVEL ?? ""}
                  onChange={(e) => setEnvField("LOG_LEVEL", e.target.value)}
                  placeholder="info"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="env-port">
                  PORT
                </label>
                <Input
                  id="env-port"
                  value={envDraft.PORT ?? ""}
                  onChange={(e) => setEnvField("PORT", e.target.value)}
                  placeholder="9090"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="env-monix">
                  MONIX_PORT
                </label>
                <Input
                  id="env-monix"
                  value={envDraft.MONIX_PORT ?? ""}
                  onChange={(e) => setEnvField("MONIX_PORT", e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2 sm:col-span-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="env-monix-path">
                  MONIX_PATH
                </label>
                <Input
                  id="env-monix-path"
                  value={envDraft.MONIX_PATH ?? ""}
                  onChange={(e) => setEnvField("MONIX_PATH", e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="submit" disabled={envSaving}>
                {envSaving ? "Saving…" : "Save to .env"}
              </Button>
              <Button type="button" variant="secondary" disabled={envSaving} onClick={() => setEnvDraft({})}>
                Clear fields
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
