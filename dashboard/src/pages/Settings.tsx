import { type ReactNode, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getInstanceSettings, getSetupStatus, type InstanceSettings, type SetupStatus } from "@/lib/api";
import { toast } from "sonner";

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

export function Settings() {
  const [instance, setInstance] = useState<InstanceSettings | null>(null);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading || !instance || !setup) {
    return (
      <div className="w-full max-w-3xl space-y-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl space-y-10">
      <PageHeader
        title="Settings"
        description="Read-only instance facts and how environment variables are managed on the server. Secrets are never returned by the API."
      />

      <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
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
          <CardTitle>Environment and database</CardTitle>
          <CardDescription>Connection state is checked live. Values such as DATABASE_URL are stored only in the server .env file.</CardDescription>
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
              To change database URL, encryption key, or optional Gemini key, edit the{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env</code> file on the server (same directory as
              the VersionGate installation), then restart the API and worker. The first-time wizard at{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/setup</code> only applies when the database is
              not yet configured.
            </p>
            <p>
              Project-specific variables for deployed apps are configured per project in the database and injected into
              containers at deploy time — not on this screen.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
