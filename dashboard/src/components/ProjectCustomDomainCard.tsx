import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  attachProjectDomain,
  issueProjectDomainSsl,
  listProjectDomains,
  removeProjectDomain,
  type ProjectDomain,
  type ProjectDomainSslStatus,
} from "@/lib/api";
import { toast } from "sonner";

interface ProjectCustomDomainCardProps {
  projectId: string;
  liveUrl?: string | null;
  onCopy?: (text: string, label: string) => void;
  onUpdated?: () => void;
}

function sslStatusLabel(status: ProjectDomainSslStatus): string {
  switch (status) {
    case "issued":
      return "TLS active";
    case "http":
      return "HTTP only";
    case "failed":
      return "TLS failed";
    default:
      return "TLS pending";
  }
}

function sslStatusBadgeClass(status: ProjectDomainSslStatus): string {
  switch (status) {
    case "issued":
      return "border-emerald-500/40 bg-emerald-600/12 text-emerald-800 dark:text-emerald-300";
    case "failed":
      return "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300";
    case "http":
      return "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300";
    default:
      return "border-border/60 bg-muted/30 text-muted-foreground";
  }
}

function StepPill({
  step,
  label,
  done,
  active,
}: {
  step: number;
  label: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2.5",
        done && "border-emerald-500/35 bg-emerald-500/[0.06]",
        active && !done && "border-primary/40 bg-primary/[0.06]",
        !done && !active && "border-border/60 bg-muted/20"
      )}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold",
          done && "bg-emerald-600 text-white",
          active && !done && "bg-primary text-primary-foreground",
          !done && !active && "bg-muted text-muted-foreground"
        )}
      >
        {done ? "OK" : step}
      </span>
      <span className="text-xs font-medium leading-tight text-foreground sm:text-sm">{label}</span>
    </div>
  );
}

export function ProjectCustomDomainCard({
  projectId,
  liveUrl,
  onCopy,
  onUpdated,
}: ProjectCustomDomainCardProps) {
  const [domains, setDomains] = useState<ProjectDomain[]>([]);
  const [expectedIpv4, setExpectedIpv4] = useState<string | null>(null);
  const [resolvedPort, setResolvedPort] = useState<number | null>(null);
  const [hostnameDraft, setHostnameDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sslRunning, setSslRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listProjectDomains(projectId);
      setDomains(data.domains);
      setExpectedIpv4(data.expectedIpv4);
      setResolvedPort(data.resolvedPort);
      setHostnameDraft(data.domains[0]?.hostname ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load custom domains");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const primary = domains[0];
  const hasDeploy = resolvedPort != null && resolvedPort > 0;
  const dnsReady = Boolean(primary?.dnsOk);
  const sslIssued = primary?.sslStatus === "issued";

  const previewUrl = useMemo(() => {
    if (!primary) return null;
    const proto = sslIssued ? "https" : "http";
    return `${proto}://${primary.hostname}`;
  }, [primary, sslIssued]);

  const onSave = async () => {
    const host = hostnameDraft.trim().toLowerCase();
    if (!host) {
      toast.error("Enter a hostname");
      return;
    }
    if (primary) {
      toast.error("Remove the current domain before attaching a different hostname");
      return;
    }
    setSaving(true);
    try {
      await attachProjectDomain(projectId, host);
      toast.success("Custom domain attached — point DNS A record to this server");
      await load();
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not attach domain");
    } finally {
      setSaving(false);
    }
  };

  const onRemove = async () => {
    if (!primary) return;
    setSaving(true);
    try {
      await removeProjectDomain(projectId, primary.id);
      toast.success("Custom domain removed");
      setHostnameDraft("");
      await load();
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove domain");
    } finally {
      setSaving(false);
    }
  };

  const onSsl = async () => {
    if (!primary) return;
    setSslRunning(true);
    try {
      await issueProjectDomainSsl(projectId, primary.id);
      toast.success("TLS certificate issued");
      await load();
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Certbot failed");
      await load();
    } finally {
      setSslRunning(false);
    }
  };

  const copyValue = (text: string, label: string) => {
    if (onCopy) {
      onCopy(text, label);
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Could not copy")
    );
  };

  return (
    <Card id="custom-domain" className="scroll-mt-24 border-border/50 bg-card/60 ring-1 ring-border/30">
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-lg font-semibold">Production custom domain</CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-relaxed">
              Serve this app on your own hostname (for example <span className="font-mono">app.example.com</span>).
              VersionGate writes isolated nginx files and can obtain Let&apos;s Encrypt TLS. Staging hostnames are planned for a later release.
            </CardDescription>
          </div>
          {primary ? (
            <Badge variant="outline" className="shrink-0 font-mono text-xs uppercase tracking-wide">
              1 hostname attached
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <StepPill step={1} label="Point DNS A record" done={dnsReady} active={!dnsReady} />
          <StepPill step={2} label="Attach hostname" done={Boolean(primary)} active={!primary} />
          <StepPill step={3} label="Issue TLS" done={sslIssued} active={Boolean(primary) && dnsReady && !sslIssued} />
          <StepPill step={4} label="Deploy production" done={hasDeploy} active={Boolean(primary) && !hasDeploy} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">DNS A record target</p>
            {expectedIpv4 ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="font-mono text-lg font-semibold tabular-nums text-foreground">{expectedIpv4}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyValue(expectedIpv4, "Server IPv4")}
                >
                  Copy
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Set <span className="font-mono">SERVER_PUBLIC_IPV4</span> or use an IP in{" "}
                <span className="font-mono">PUBLIC_DOMAIN</span> so the dashboard can show the DNS target.
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Create an A record at your DNS provider pointing your hostname to this IPv4.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Production traffic</p>
            {hasDeploy ? (
              <p className="mt-2 font-mono text-lg font-semibold tabular-nums text-foreground">Port {resolvedPort}</p>
            ) : (
              <p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-400">No ACTIVE deploy</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {hasDeploy
                ? "Nginx upstream switches automatically on blue/green deploys."
                : "The hostname returns 502/503 until the first healthy production deploy."}
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">TLS status</p>
            {primary ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge className={cn("font-mono text-xs", sslStatusBadgeClass(primary.sslStatus))}>
                  {sslStatusLabel(primary.sslStatus)}
                </Badge>
                {primary.dnsOk ? (
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">DNS resolved</span>
                ) : (
                  <span className="text-sm text-muted-foreground">Waiting for DNS</span>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Attach a hostname to begin.</p>
            )}
            {primary?.lastError ? (
              <p className="mt-2 text-xs text-red-700 dark:text-red-400" title={primary.lastError}>
                {primary.lastError}
              </p>
            ) : null}
          </div>
        </div>

        {!hasDeploy ? (
          <Alert>
            <AlertTitle>Deploy required for live traffic</AlertTitle>
            <AlertDescription>
              You can attach the domain before deploying. Visitors will see 502/503 until production has an ACTIVE
              container. Run <strong>Deploy Production</strong> above when you are ready.
            </AlertDescription>
          </Alert>
        ) : null}

        {primary && !primary.dnsOk ? (
          <Alert>
            <AlertTitle>DNS not detected yet</AlertTitle>
            <AlertDescription>
              Propagation can take a few minutes. Confirm the A record points to{" "}
              {expectedIpv4 ? <span className="font-mono">{expectedIpv4}</span> : "this server"} before running Certbot.
              {primary.dnsA.length > 0 ? (
                <>
                  {" "}
                  Currently resolving to: <span className="font-mono">{primary.dnsA.join(", ")}</span>
                </>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <Separator />

        {primary ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-background/40 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Attached hostname</p>
                <p className="truncate font-mono text-xl font-semibold text-foreground sm:text-2xl">{primary.hostname}</p>
                {previewUrl ? (
                  <p className="truncate text-sm text-muted-foreground">
                    Public URL: <span className="font-mono text-foreground">{previewUrl}</span>
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {previewUrl || liveUrl ? (
                  <a
                    href={previewUrl ?? liveUrl ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      buttonVariants({ variant: "default", size: "default" }),
                      "bg-emerald-600 hover:bg-emerald-700 text-white"
                    )}
                  >
                    Open live app
                  </a>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  disabled={sslRunning || !primary.dnsOk || primary.sslStatus === "issued"}
                  onClick={() => void onSsl()}
                >
                  {sslRunning ? "Running Certbot…" : primary.sslStatus === "issued" ? "TLS active" : "Obtain SSL (Certbot)"}
                </Button>
                <Button type="button" variant="ghost" disabled={saving} onClick={() => void onRemove()}>
                  Remove domain
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void onSave();
            }}
          >
            <div className="space-y-2">
              <label htmlFor="project-custom-hostname" className="text-sm font-medium text-foreground">
                Hostname
              </label>
              <Input
                id="project-custom-hostname"
                className="h-11 font-mono text-base"
                placeholder="app.example.com"
                value={hostnameDraft}
                onChange={(e) => setHostnameDraft(e.target.value)}
                disabled={loading || saving}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                Use a subdomain or apex hostname. Raw IPv4 addresses are not supported. Must differ from the VersionGate
                dashboard domain (<span className="font-mono">PUBLIC_DOMAIN</span>).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving || loading || !hostnameDraft.trim()}>
                {saving ? "Attaching…" : "Attach production domain"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
